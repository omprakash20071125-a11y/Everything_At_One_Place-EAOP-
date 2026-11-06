import argparse
import json
import re
import shutil

from pathlib import Path
from datetime import datetime

import camelot
import fitz
import pytesseract

from PIL import Image

from app.dependencies.database import SessionLocal
from app.modules.bus_schedule.models import BusTrip
from app.modules.bus_schedule.schema import BusScheduleImport


# --------------------------------------------
# PATHS
# --------------------------------------------

BASE_DIR = Path(__file__).resolve().parents[1]

PDF_PATH = BASE_DIR / "app" / "data" / "Bus_Schedule.pdf"

OUTPUT_PATH = (
    BASE_DIR
    / "scripts"
    / "output"
    / "bus_schedule_extracted.json"
)

EXPECTED_TRIPS = 38

OCR_SCALE = 4


# --------------------------------------------
# TIME EXTRACTION
# --------------------------------------------

TIME_PATTERN = re.compile(
    r"(?<!\d)(\d{1,2})\s*[:.]\s*(\d{2})\s*(AM|PM)\b",
    re.IGNORECASE
)


def clean_text(value):

    value = str(value or "")

    value = value.replace("\n", " ")

    value = re.sub(r"\s+", " ", value)

    return value.strip()


def clean_location(value):

    value = clean_text(value)

    value = value.strip(" *|:;")

    value = re.sub(
        r"\bSamiyan\s+a\b",
        "Samiyana",
        value,
        flags=re.IGNORECASE
    )

    return value


def format_time(match):

    value = (
        f"{match.group(1)}:"
        f"{match.group(2)} "
        f"{match.group(3).upper()}"
    )

    parsed = datetime.strptime(
        value,
        "%I:%M %p"
    )

    return parsed.strftime("%H:%M")


# --------------------------------------------
# ROUTE EXTRACTION USING OCR
# --------------------------------------------

def extract_route(
    table,
    page_image,
    page_height,
    row_index,
    column_index
):

    cell = table.cells[row_index][column_index]

    x1 = int(cell.x1 * OCR_SCALE)
    x2 = int(cell.x2 * OCR_SCALE)

    y1 = int(
        (page_height - cell.y2) * OCR_SCALE
    )

    y2 = int(
        (page_height - cell.y1) * OCR_SCALE
    )

    crop = page_image.crop(
        (x1, y1, x2, y2)
    )

    # Improve recognition of small text.

    crop = crop.resize(
        (
            crop.width * 2,
            crop.height * 2
        )
    )

    text = pytesseract.image_to_string(
        crop,
        config="--psm 6"
    )

    text = clean_text(text)

    # Common OCR correction at the beginning
    # of routes starting with IITJ.

    text = re.sub(
        r"^ITJ(?=[\s-])",
        "IITJ",
        text,
        flags=re.IGNORECASE
    )

    return text


# --------------------------------------------
# EXTRACT ONE TRIP
# --------------------------------------------

def extract_trip(
    row,
    table,
    page_image,
    page_height,
    row_index,
    page_number,
    side
):

    if side == "left":

        bus_column = 0
        metadata_columns = [1, 2, 3, 4]
        route_column = 5

    else:

        bus_column = 6
        metadata_columns = [7, 8, 9, 10]
        route_column = 11

    bus_number = clean_text(
        row[bus_column]
    ).upper()

    if bus_number not in {"B1", "B2", "B3"}:
        return None

    metadata = " ".join(
        clean_text(row[index])
        for index in metadata_columns
    )

    matches = list(
        TIME_PATTERN.finditer(metadata)
    )

    if len(matches) != 2:

        raise ValueError(
            f"Could not identify departure and arrival "
            f"times on page {page_number}, row {row_index}, "
            f"side {side}: {metadata}"
        )

    departure_time = format_time(matches[0])

    arrival_time = format_time(matches[1])

    # Extract origin between the two time values.

    origin = clean_location(
        metadata[
            matches[0].end():matches[1].start()
        ]
    )

    if side == "left":

        destination = clean_location(
            metadata[matches[1].end():]
        )

    else:

        # The right-hand schedule entries all return to IITJ.

        destination = "IITJ"

    route = extract_route(
        table=table,
        page_image=page_image,
        page_height=page_height,
        row_index=row_index,
        column_index=route_column
    )

    if not origin:
        raise ValueError(
            f"Missing origin on page {page_number}"
        )

    if not destination:
        raise ValueError(
            f"Missing destination on page {page_number}"
        )

    if not route:
        raise ValueError(
            f"Missing route on page {page_number}"
        )

    schedule_type = (
        "regular"
        if page_number in (1, 2)
        else "weekend_holiday"
    )

    return {
        "bus_number": bus_number,

        "schedule_type": schedule_type,

        "departure_time": departure_time,
        "origin": origin,

        "arrival_time": arrival_time,
        "destination": destination,

        "route": route,

        "source_page": page_number,

        # Review every OCR-extracted record before import.
        "needs_review": True,

        "review_notes": (
            "Verify the timings, locations and OCR route "
            "against the original PDF."
        )
    }


# --------------------------------------------
# EXTRACT COMPLETE PDF
# --------------------------------------------

def extract_pdf():

    if not PDF_PATH.exists():

        raise FileNotFoundError(
            f"Bus schedule PDF not found: {PDF_PATH}"
        )

    if not shutil.which("tesseract"):

        raise RuntimeError(
            "Tesseract not found. Install it using brew install tesseract"
        )

    document = fitz.open(PDF_PATH)

    tables = camelot.read_pdf(
        str(PDF_PATH),
        pages="all",
        flavor="lattice"
    )

    print("Tables detected:", tables.n)

    records = []

    image_cache = {}

    for table in tables:

        page_number = int(table.page)

        page = document[page_number - 1]

        if len(table.df.columns) != 12:

            raise ValueError(
                f"Unexpected table structure on page {page_number}. "
                "Expected 12 columns."
            )

        # Render each page only once.

        if page_number not in image_cache:

            pix = page.get_pixmap(
                matrix=fitz.Matrix(
                    OCR_SCALE,
                    OCR_SCALE
                ),
                alpha=False
            )

            image_cache[page_number] = Image.frombytes(
                "RGB",
                [pix.width, pix.height],
                pix.samples
            )

        page_image = image_cache[page_number]

        rows = table.df.values.tolist()

        for row_index, row in enumerate(rows):

            for side in ("left", "right"):

                trip = extract_trip(
                    row=row,
                    table=table,
                    page_image=page_image,
                    page_height=page.rect.height,
                    row_index=row_index,
                    page_number=page_number,
                    side=side
                )

                if trip:
                    records.append(trip)

    document.close()

    # Validate total number of extracted trips.

    print("\nExtraction completed.")

    print("Total trips:", len(records))

    if len(records) != EXPECTED_TRIPS:

        print(
            f"WARNING: Expected {EXPECTED_TRIPS} trips, "
            f"but extracted {len(records)}."
        )

    # Generate JSON for manual verification.

    OUTPUT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    OUTPUT_PATH.write_text(
        json.dumps(
            {"trips": records},
            indent=4,
            ensure_ascii=False
        ),
        encoding="utf-8"
    )

    print("\nJSON created:", OUTPUT_PATH)

    print("Please review the JSON before importing.")


# --------------------------------------------
# IMPORT REVIEWED RECORDS INTO POSTGRESQL
# --------------------------------------------
def import_reviewed_json():

    if not OUTPUT_PATH.exists():
        raise FileNotFoundError(
            "Extracted JSON not found. Run --extract first."
        )

    extracted = BusScheduleImport.model_validate_json(
        OUTPUT_PATH.read_text(encoding="utf-8")
    )

    trips = extracted.trips

    if len(trips) != EXPECTED_TRIPS:
        raise ValueError(
            f"Expected {EXPECTED_TRIPS} trips, received {len(trips)}."
        )

    records = []
    seen = set()

    for trip in trips:

        if trip.needs_review:
            raise ValueError(
                f"Review required for {trip.bus_number}: "
                f"{trip.review_notes}"
            )

        departure = datetime.strptime(
            trip.departure_time,
            "%H:%M"
        ).time()

        arrival = datetime.strptime(
            trip.arrival_time,
            "%H:%M"
        ).time()

        identity = (
            trip.bus_number,
            trip.schedule_type,
            departure,
            trip.origin,
            trip.destination
        )

        if identity in seen:
            raise ValueError(f"Duplicate trip: {identity}")

        seen.add(identity)

        records.append(
            BusTrip(
                bus_number=trip.bus_number,
                schedule_type=trip.schedule_type,
                departure_time=departure,
                origin=trip.origin,
                arrival_time=arrival,
                destination=trip.destination,
                route=trip.route,
                source_page=trip.source_page
            )
        )

    db = SessionLocal()

    try:
        db.query(BusTrip).delete(
            synchronize_session=False
        )

        db.add_all(records)

        db.commit()

        print(
            f"Successfully imported {len(records)} bus trips."
        )

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


# --------------------------------------------
# COMMAND LINE
# --------------------------------------------

if __name__ == "__main__":

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--extract",
        action="store_true"
    )

    parser.add_argument(
        "--import-reviewed",
        action="store_true"
    )

    args = parser.parse_args()

    if args.extract:

        extract_pdf()

    elif args.import_reviewed:

        import_reviewed_json()

    else:

        parser.error(
            "Use --extract or --import-reviewed"
        )