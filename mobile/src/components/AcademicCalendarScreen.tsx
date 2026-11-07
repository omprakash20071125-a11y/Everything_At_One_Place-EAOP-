import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import { academicEventsOnDate, toDateKey } from "../data/academicCalendar";
import type { AcademicEvent, AcademicEventCategory } from "../data/academicCalendar";

type StudentEvent = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  created_at?: string;
};

type CalendarItem = {
  id: string;
  title: string;
  description?: string | null;
  category: AcademicEventCategory | "Personal";
  isPersonal: boolean;
  startTime?: string | null;
};

const COLORS: Record<string, string> = {
  Academic: "#7565D8",
  Examination: "#E28A42",
  Campus: "#269B83",
  Break: "#8B91A5",
  Holiday: "#D65C6C",
  Timetable: "#3B82B8",
  Personal: "#D18B31",
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  const [hoursText, minutesText] = value.slice(0, 5).split(":");
  const hours = Number(hoursText);
  if (!Number.isFinite(hours)) return value;
  return `${hours % 12 || 12}:${minutesText} ${hours >= 12 ? "PM" : "AM"}`;
}

export default function AcademicCalendarScreen({ userId }: { userId: string }) {
  const todayKey = toDateKey(new Date());
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [personalEvents, setPersonalEvents] = useState<StudentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");

  async function loadPersonalEvents() {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("student_calendar_events")
      .select("id,user_id,title,description,event_date,start_time,created_at")
      .eq("user_id", userId)
      .order("event_date", { ascending: true });
    if (error) {
      Alert.alert(
        "Calendar could not load",
        error.message.includes("student_calendar_events")
          ? "Create the student_calendar_events table in Supabase using the SQL file included with this update."
          : error.message
      );
    } else {
      setPersonalEvents((data || []) as StudentEvent[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadPersonalEvents();
  }, [userId]);

  const calendarCells = useMemo(() => {
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const leading = first.getDay();
    const days = new Date(
      visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0
    ).getDate();
    const total = Math.ceil((leading + days) / 7) * 7;
    return Array.from({ length: total }, (_, index) =>
      new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index - leading + 1)
    );
  }, [visibleMonth]);

  function itemsForDate(dateKey: string): CalendarItem[] {
    const official: CalendarItem[] = academicEventsOnDate(dateKey).map((event: AcademicEvent) => ({
      id: event.id,
      title: event.title,
      description: event.description || `${event.semester}${event.tentative ? " · Tentative" : ""}`,
      category: event.category,
      isPersonal: false,
    }));
    const personal: CalendarItem[] = personalEvents
      .filter((event) => event.event_date === dateKey)
      .map((event) => ({
        id: event.id,
        title: event.title,
        description: event.description,
        category: "Personal",
        isPersonal: true,
        startTime: event.start_time,
      }));
    return [...official, ...personal];
  }

  const selectedItems = useMemo(
    () => itemsForDate(selectedDate),
    [selectedDate, personalEvents]
  );

  function moveMonth(offset: number) {
    const nextMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + offset,
      1
    );
    setVisibleMonth(nextMonth);
    setSelectedDate(toDateKey(nextMonth));
  }

  async function addPersonalEvent() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      Alert.alert("Add a title", "Enter a name for your event.");
      return;
    }
    if (startTime.trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime.trim())) {
      Alert.alert("Invalid time", "Enter time in 24-hour format, for example 14:30.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("student_calendar_events")
      .insert({
        user_id: userId,
        title: cleanTitle,
        description: description.trim() || null,
        event_date: selectedDate,
        start_time: startTime.trim() || null,
      })
      .select("id,user_id,title,description,event_date,start_time,created_at")
      .single();
    setSaving(false);
    if (error) {
      Alert.alert("Could not save event", error.message);
      return;
    }
    setPersonalEvents((current) => [...current, data as StudentEvent]);
    setTitle("");
    setDescription("");
    setStartTime("");
    setFormOpen(false);
  }

  async function deletePersonalEvent(eventId: string) {
    Alert.alert("Delete event?", "This will remove your personal event.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("student_calendar_events")
            .delete()
            .eq("id", eventId)
            .eq("user_id", userId);
          if (error) {
            Alert.alert("Could not delete event", error.message);
            return;
          }
          setPersonalEvents((current) => current.filter((event) => event.id !== eventId));
        },
      },
    ]);
  }

  function selectDate(date: Date) {
    const key = toDateKey(date);
    setSelectedDate(key);
    if (date.getMonth() !== visibleMonth.getMonth() || date.getFullYear() !== visibleMonth.getFullYear()) {
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>EAOP · STUDENT PLANNER</Text>
            <Text style={styles.heading}>Academic Calendar</Text>
            <Text style={styles.subheading}>IIT Jodhpur · Academic Year 2026-27</Text>
          </View>
          <Pressable style={styles.todayButton} onPress={() => {
            const now = new Date();
            setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
            setSelectedDate(toDateKey(now));
          }}>
            <Text style={styles.todayButtonText}>Today</Text>
          </Pressable>
        </View>

        <View style={styles.monthCard}>
          <View style={styles.monthHeader}>
            <Pressable style={styles.monthArrow} onPress={() => moveMonth(-1)}>
              <Text style={styles.monthArrowText}>‹</Text>
            </Pressable>
            <Text style={styles.monthTitle}>
              {MONTHS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
            </Text>
            <Pressable style={styles.monthArrow} onPress={() => moveMonth(1)}>
              <Text style={styles.monthArrowText}>›</Text>
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((day, index) => (
              <View key={`${day}-${index}`} style={styles.weekdayCell}>
                <Text style={styles.weekdayText}>{day}</Text>
              </View>
            ))}
          </View>
          {Array.from({ length: Math.ceil(calendarCells.length / 7) }, (_, row) => (
            <View key={row} style={styles.weekRow}>
              {calendarCells.slice(row * 7, row * 7 + 7).map((date) => {
                const key = toDateKey(date);
                const inMonth = date.getMonth() === visibleMonth.getMonth();
                const selected = key === selectedDate;
                const today = key === todayKey;
                const dayItems = itemsForDate(key);
                const dots = Array.from(new Set(dayItems.map((item) => item.category))).slice(0, 3);
                return (
                  <Pressable
                    key={key}
                    style={[styles.dayCell, selected && styles.dayCellSelected]}
                    onPress={() => selectDate(date)}
                  >
                    <Text style={[
                      styles.dayNumber,
                      !inMonth && styles.dayNumberOutside,
                      today && styles.dayNumberToday,
                      selected && styles.dayNumberSelected,
                    ]}>{date.getDate()}</Text>
                    <View style={styles.dotRow}>
                      {dots.map((category) => (
                        <View key={category} style={[styles.eventDot, { backgroundColor: COLORS[category] }]} />
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
          <View style={styles.legend}>
            {(["Academic", "Examination", "Campus", "Break", "Holiday", "Timetable", "Personal"] as const).map((category) => (
              <View key={category} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLORS[category] }]} />
                <Text style={styles.legendText}>{category}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.agendaHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.agendaTitle}>Agenda</Text>
            <Text style={styles.agendaDate}>{formatDateLabel(selectedDate)}</Text>
          </View>
          <Pressable style={styles.addButton} onPress={() => setFormOpen((open) => !open)}>
            <Text style={styles.addButtonText}>{formOpen ? "Close" : "+ Add event"}</Text>
          </Pressable>
        </View>

        {formOpen && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Add your event</Text>
            <Text style={styles.formDate}>{formatDateLabel(selectedDate)}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Event title (e.g. Project meeting)"
              placeholderTextColor="#A19DB0"
              style={styles.input}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Notes (optional)"
              placeholderTextColor="#A19DB0"
              style={[styles.input, styles.notesInput]}
              multiline
            />
            <TextInput
              value={startTime}
              onChangeText={setStartTime}
              placeholder="Time (optional, 24-hour e.g. 14:30)"
              placeholderTextColor="#A19DB0"
              style={styles.input}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
            <Pressable style={[styles.saveButton, saving && styles.disabledButton]} onPress={addPersonalEvent} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save to my calendar</Text>}
            </Pressable>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingRow}><ActivityIndicator color="#7565D8" /><Text style={styles.emptyText}>Loading your events...</Text></View>
        ) : selectedItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nothing planned</Text>
            <Text style={styles.emptyText}>No institute events or personal plans are listed for this date.</Text>
          </View>
        ) : (
          <View style={styles.agendaList}>
            {selectedItems.map((item) => (
              <View key={`${item.isPersonal ? "personal" : "official"}-${item.id}`} style={styles.eventCard}>
                <View style={[styles.eventBar, { backgroundColor: COLORS[item.category] }]} />
                <View style={styles.eventBody}>
                  <View style={styles.eventMetaRow}>
                    <Text style={[styles.categoryLabel, { color: COLORS[item.category] }]}>{item.category.toUpperCase()}</Text>
                    {item.startTime ? <Text style={styles.eventTime}>{formatTime(item.startTime)}</Text> : null}
                    {item.isPersonal ? (
                      <Pressable onPress={() => deletePersonalEvent(item.id)}>
                        <Text style={styles.deleteText}>Delete</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Text style={styles.eventTitle}>{item.title}</Text>
                  {!!item.description && <Text style={styles.eventDescription}>{item.description}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Calendar information</Text>
          <Text style={styles.noticeText}>
            Institute dates are transcribed from the IIT Jodhpur Academic Calendar AY 2026-27. Multi-day activities appear on every date in their range. Tentative events are labelled.
          </Text>
          <Text style={styles.noticeText}>
            The PDF states that Semester-II holidays are yet to be declared and will be updated when notified by the Institute.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F6FC" },
  content: { padding: 18, paddingBottom: 30 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  eyebrow: { color: "#7565D8", fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 6 },
  heading: { color: "#28243A", fontSize: 25, fontWeight: "900" },
  subheading: { color: "#8B879A", fontSize: 12, marginTop: 5 },
  todayButton: { borderRadius: 12, backgroundColor: "#EFECFF", paddingHorizontal: 14, paddingVertical: 10 },
  todayButtonText: { color: "#7565D8", fontWeight: "800", fontSize: 12 },
  monthCard: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 12, borderWidth: 1, borderColor: "#ECE9F4", marginBottom: 22 },
  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  monthTitle: { color: "#28243A", fontSize: 17, fontWeight: "900" },
  monthArrow: { width: 38, height: 36, borderRadius: 11, backgroundColor: "#F5F3FA", alignItems: "center", justifyContent: "center" },
  monthArrowText: { color: "#7565D8", fontSize: 26, lineHeight: 28, fontWeight: "600" },
  weekRow: { flexDirection: "row" },
  weekdayCell: { width: "14.2857%", height: 30, alignItems: "center", justifyContent: "center" },
  weekdayText: { color: "#9995AA", fontSize: 11, fontWeight: "900" },
  dayCell: { width: "14.2857%", minHeight: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingTop: 4, marginBottom: 2 },
  dayCellSelected: { backgroundColor: "#7565D8" },
  dayNumber: { color: "#39354A", fontSize: 13, fontWeight: "700" },
  dayNumberOutside: { color: "#C7C3D1" },
  dayNumberToday: { color: "#7565D8", textDecorationLine: "underline" },
  dayNumberSelected: { color: "#FFFFFF", textDecorationLine: "none" },
  dotRow: { height: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, marginTop: 3 },
  eventDot: { width: 4, height: 4, borderRadius: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 13, rowGap: 8, borderTopWidth: 1, borderTopColor: "#F0EEF5", paddingTop: 12, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { color: "#858194", fontSize: 10, fontWeight: "700" },
  agendaHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  agendaTitle: { color: "#28243A", fontSize: 20, fontWeight: "900" },
  agendaDate: { color: "#8B879A", fontSize: 11, marginTop: 4 },
  addButton: { backgroundColor: "#7565D8", borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10 },
  addButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  formCard: { backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: "#EAE7F2", padding: 15, marginBottom: 14 },
  formTitle: { color: "#28243A", fontSize: 16, fontWeight: "900" },
  formDate: { color: "#8B879A", fontSize: 11, marginTop: 4, marginBottom: 12 },
  input: { backgroundColor: "#F8F7FB", borderWidth: 1, borderColor: "#EAE7F2", borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, color: "#302C41", fontSize: 13, marginBottom: 9 },
  notesInput: { minHeight: 66, textAlignVertical: "top" },
  saveButton: { backgroundColor: "#7565D8", borderRadius: 11, alignItems: "center", justifyContent: "center", minHeight: 43, marginTop: 2 },
  saveButtonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },
  disabledButton: { opacity: 0.65 },
  agendaList: { gap: 9 },
  eventCard: { flexDirection: "row", overflow: "hidden", backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#ECE9F4", minHeight: 76 },
  eventBar: { width: 4 },
  eventBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  eventMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 5 },
  categoryLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  eventTime: { color: "#858194", fontSize: 10, fontWeight: "700" },
  deleteText: { color: "#C65061", fontSize: 10, fontWeight: "800", marginLeft: "auto" },
  eventTitle: { color: "#302C41", fontSize: 13, fontWeight: "800", lineHeight: 18 },
  eventDescription: { color: "#8B879A", fontSize: 11, marginTop: 4, lineHeight: 16 },
  emptyCard: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 18, borderWidth: 1, borderColor: "#ECE9F4" },
  emptyTitle: { color: "#302C41", fontSize: 14, fontWeight: "900", marginBottom: 5 },
  emptyText: { color: "#9691A3", fontSize: 11, lineHeight: 16 },
  loadingRow: { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", padding: 20 },
  noticeCard: { backgroundColor: "#EFEDFA", borderRadius: 15, padding: 14, marginTop: 18 },
  noticeTitle: { color: "#5549A4", fontSize: 12, fontWeight: "900", marginBottom: 6 },
  noticeText: { color: "#6E6984", fontSize: 10, lineHeight: 15, marginTop: 3 },
});
