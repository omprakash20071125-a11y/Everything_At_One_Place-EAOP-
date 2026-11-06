import React, { useCallback, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import StudentGymkhanaChartSvg from "../../assets/student-gymkhana-organizational-structure.svg";
import {
  STUDENT_GYMKHANA_CHART,
  STUDENT_GYMKHANA_NODES,
  type StudentGymkhanaNode,
} from "../data/studentGymkhanaNodes";

type ViewBox = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type TouchState = { points: Point[]; midpoint: Point; distance: number };

type StudentGymkhanaTreeProps = {
  onBack: () => void;
};

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 6;
const INITIAL_VIEW_BOX: ViewBox = {
  x: 0,
  y: 0,
  width: STUDENT_GYMKHANA_CHART.width,
  height: STUDENT_GYMKHANA_CHART.height,
};

function fitViewBox(width: number, height: number): ViewBox {
  const usableWidth = Math.max(1, width - 32);
  const usableHeight = Math.max(1, height - 32);
  const unitsPerPixel = Math.max(
    STUDENT_GYMKHANA_CHART.width / usableWidth,
    STUDENT_GYMKHANA_CHART.height / usableHeight
  );
  const boxWidth = width * unitsPerPixel;
  const boxHeight = height * unitsPerPixel;

  return {
    x: (STUDENT_GYMKHANA_CHART.width - boxWidth) / 2,
    y: (STUDENT_GYMKHANA_CHART.height - boxHeight) / 2,
    width: boxWidth,
    height: boxHeight,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function getTouchState(touches: any[], origin: Point): TouchState | null {
  const points: Point[] = touches.map((touch) => ({
    x: touch.pageX - origin.x,
    y: touch.pageY - origin.y,
  }));
  if (points.length === 0) return null;

  const first = points[0];
  const second = points.length > 1 ? points[1] : first;
  return {
    points,
    midpoint: {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    },
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
}

export default function StudentGymkhanaTree({
  onBack,
}: StudentGymkhanaTreeProps) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [viewBox, setViewBox] = useState<ViewBox>(INITIAL_VIEW_BOX);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const viewportRef = useRef<React.ComponentRef<typeof View>>(null);
  const viewportOrigin = useRef<Point>({ x: 0, y: 0 });
  const viewBoxRef = useRef(viewBox);
  const touchState = useRef<TouchState | null>(null);
  const mouseDrag = useRef<{ pointerId: number; point: Point } | null>(null);
  const renderFrame = useRef<number | null>(null);

  const commitViewBox = useCallback((next: ViewBox) => {
    viewBoxRef.current = next;
    if (renderFrame.current !== null) return;
    renderFrame.current = requestAnimationFrame(() => {
      renderFrame.current = null;
      setViewBox(viewBoxRef.current);
    });
  }, []);

  const fitToScreen = useCallback(() => {
    if (!viewport.width || !viewport.height) return;
    const next = fitViewBox(viewport.width, viewport.height);
    viewBoxRef.current = next;
    setViewBox(next);
  }, [viewport.height, viewport.width]);

  const resetView = useCallback(() => {
    setSelectedNodeId(null);
    fitToScreen();
  }, [fitToScreen]);

  const zoomAt = useCallback(
    (factor: number, focus: Point) => {
      if (!viewport.width || !viewport.height) return;
      const current = viewBoxRef.current;
      const fit = fitViewBox(viewport.width, viewport.height);
      const nextWidth = clamp(
        current.width / factor,
        fit.width / MAX_ZOOM,
        fit.width / MIN_ZOOM
      );
      const nextHeight = nextWidth * (current.height / current.width);
      const anchorX = current.x + (focus.x / viewport.width) * current.width;
      const anchorY = current.y + (focus.y / viewport.height) * current.height;
      const nextX = anchorX - (focus.x / viewport.width) * nextWidth;
      const nextY = anchorY - (focus.y / viewport.height) * nextHeight;

      commitViewBox({
        x: clamp(nextX, Math.min(0, STUDENT_GYMKHANA_CHART.width - nextWidth), Math.max(0, STUDENT_GYMKHANA_CHART.width - nextWidth)),
        y: clamp(nextY, Math.min(0, STUDENT_GYMKHANA_CHART.height - nextHeight), Math.max(0, STUDENT_GYMKHANA_CHART.height - nextHeight)),
        width: nextWidth,
        height: nextHeight,
      });
    },
    [commitViewBox, viewport.height, viewport.width]
  );

  const panBy = useCallback(
    (deltaX: number, deltaY: number) => {
      if (!viewport.width || !viewport.height) return;
      const current = viewBoxRef.current;
      const nextX = current.x - (deltaX / viewport.width) * current.width;
      const nextY = current.y - (deltaY / viewport.height) * current.height;

      commitViewBox({
        ...current,
        x: clamp(nextX, Math.min(0, STUDENT_GYMKHANA_CHART.width - current.width), Math.max(0, STUDENT_GYMKHANA_CHART.width - current.width)),
        y: clamp(nextY, Math.min(0, STUDENT_GYMKHANA_CHART.height - current.height), Math.max(0, STUDENT_GYMKHANA_CHART.height - current.height)),
      });
    },
    [commitViewBox, viewport.height, viewport.width]
  );

  const handleViewportLayout = useCallback((event: any) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport({ width, height });
    viewportRef.current?.measureInWindow((x, y) => {
      viewportOrigin.current = { x, y };
    });
    const next = fitViewBox(width, height);
    viewBoxRef.current = next;
    setViewBox(next);
  }, []);

  const handleTouchStart = useCallback((event: any) => {
    touchState.current = getTouchState(
      event.nativeEvent.touches,
      viewportOrigin.current
    );
  }, []);

  const handleTouchMove = useCallback(
    (event: any) => {
      const previous = touchState.current;
      const current = getTouchState(
        event.nativeEvent.touches,
        viewportOrigin.current
      );
      if (!current) return;

      if (previous?.points.length && current.points.length > 1) {
        if (previous.points.length > 1 && previous.distance > 0) {
          zoomAt(current.distance / previous.distance, previous.midpoint);
          panBy(
            current.midpoint.x - previous.midpoint.x,
            current.midpoint.y - previous.midpoint.y
          );
        }
      } else if (previous?.points.length === 1 && current.points.length === 1) {
        panBy(
          current.points[0].x - previous.points[0].x,
          current.points[0].y - previous.points[0].y
        );
      }

      touchState.current = current;
      event.preventDefault?.();
    },
    [panBy, zoomAt]
  );

  const handleTouchEnd = useCallback((event: any) => {
    touchState.current = getTouchState(
      event.nativeEvent.touches,
      viewportOrigin.current
    );
  }, []);

  const handleWheel = useCallback(
    (event: any) => {
      const nativeEvent = event.nativeEvent;
      const focus = {
        x: nativeEvent.pageX - viewportOrigin.current.x,
        y: nativeEvent.pageY - viewportOrigin.current.y,
      };
      zoomAt(nativeEvent.deltaY < 0 ? 1.15 : 1 / 1.15, focus);
      event.preventDefault?.();
    },
    [zoomAt]
  );

  const handlePointerDown = useCallback((event: any) => {
    const nativeEvent = event.nativeEvent;
    if (nativeEvent.pointerType !== "mouse" || nativeEvent.button !== 0) return;
    mouseDrag.current = {
      pointerId: nativeEvent.pointerId,
      point: {
        x: nativeEvent.pageX - viewportOrigin.current.x,
        y: nativeEvent.pageY - viewportOrigin.current.y,
      },
    };
  }, []);

  const handlePointerMove = useCallback(
    (event: any) => {
      const nativeEvent = event.nativeEvent;
      const drag = mouseDrag.current;
      if (!drag || drag.pointerId !== nativeEvent.pointerId) return;
      const point = {
        x: nativeEvent.pageX - viewportOrigin.current.x,
        y: nativeEvent.pageY - viewportOrigin.current.y,
      };
      panBy(point.x - drag.point.x, point.y - drag.point.y);
      drag.point = point;
    },
    [panBy]
  );

  const selectedNode = STUDENT_GYMKHANA_NODES.find(
    (node) => node.id === selectedNodeId
  );
  const fitBox = viewport.width && viewport.height
    ? fitViewBox(viewport.width, viewport.height)
    : INITIAL_VIEW_BOX;
  const zoomPercentage = Math.round((fitBox.width / viewBox.width) * 100);
  const viewBoxString = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;

  const handleWheelProps = { onWheel: handleWheel };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to About IIT J"
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.logo}>EAOP.</Text>
      </View>

      <Text style={styles.heading}>Student Gymkhana</Text>
      <Text style={styles.subtitle}>Organizational Structure</Text>

      <View style={styles.toolbar}>
        <Pressable
          style={styles.controlButton}
          onPress={() => zoomAt(1.2, { x: viewport.width / 2, y: viewport.height / 2 })}
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
        >
          <Text style={styles.controlText}>+</Text>
        </Pressable>
        <Pressable
          style={styles.controlButton}
          onPress={() => zoomAt(1 / 1.2, { x: viewport.width / 2, y: viewport.height / 2 })}
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
        >
          <Text style={styles.controlText}>−</Text>
        </Pressable>
        <Text style={styles.zoomLabel}>{zoomPercentage}%</Text>
        <Pressable
          style={styles.textControlButton}
          onPress={resetView}
          accessibilityRole="button"
          accessibilityLabel="Fit chart to screen"
        >
          <Text style={styles.textControlText}>Fit to Screen</Text>
        </Pressable>
        <Pressable
          style={styles.textControlButton}
          onPress={fitToScreen}
          accessibilityRole="button"
          accessibilityLabel="Reset chart view"
        >
          <Text style={styles.textControlText}>Reset View</Text>
        </Pressable>
      </View>

      <View
        ref={viewportRef}
        onLayout={handleViewportLayout}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => { mouseDrag.current = null; }}
        onPointerCancel={() => { mouseDrag.current = null; }}
        {...handleWheelProps}
        style={styles.viewport}
        accessibilityLabel="Interactive Student Gymkhana organizational chart"
      >
        {viewport.width > 0 && viewport.height > 0 && (
          <View
            style={[
              styles.chartCanvas,
              { width: viewport.width, height: viewport.height },
            ]}
          >
            <StudentGymkhanaChartSvg
              width={viewport.width}
              height={viewport.height}
              viewBox={viewBoxString}
              preserveAspectRatio="none"
            />
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              {STUDENT_GYMKHANA_NODES.map((node: StudentGymkhanaNode) => {
                const selected = node.id === selectedNodeId;
                const related =
                  selectedNodeId !== null &&
                  (node.parentId === selectedNodeId ||
                    selectedNode?.parentId === node.id);
                const position = {
                  left:
                    ((node.x - viewBox.x) / viewBox.width) * viewport.width,
                  top:
                    ((node.y - viewBox.y) / viewBox.height) * viewport.height,
                  width: (node.width / viewBox.width) * viewport.width,
                  height: (node.height / viewBox.height) * viewport.height,
                };

                return (
                  <Pressable
                    key={node.id}
                    style={[
                      styles.nodeHitArea,
                      position,
                      selected && styles.selectedNodeHitArea,
                      related && styles.relatedNodeHitArea,
                    ]}
                    onPress={() => setSelectedNodeId(node.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${node.label}`}
                    accessibilityState={{ selected }}
                  />
                );
              })}
            </View>
          </View>
        )}
      </View>

      <Text style={styles.selectionLabel} accessibilityLiveRegion="polite">
        {selectedNode ? `Selected: ${selectedNode.label}` : "Select a chart node to highlight its reporting relationship."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F6FC",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  backButton: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E2F0",
  },
  backButtonText: {
    color: "#7565D8",
    fontWeight: "700",
    fontSize: 13,
  },
  logo: {
    color: "#7565D8",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -1,
  },
  heading: {
    color: "#202033",
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    color: "#77758A",
    fontSize: 13,
    marginTop: 3,
    marginBottom: 12,
  },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  controlButton: {
    width: 40,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E2F0",
  },
  controlText: {
    color: "#7565D8",
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 24,
  },
  zoomLabel: {
    minWidth: 45,
    textAlign: "center",
    color: "#55536A",
    fontSize: 12,
    fontWeight: "700",
  },
  textControlButton: {
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#7565D8",
  },
  textControlText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  viewport: {
    flex: 1,
    minHeight: 240,
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E2F0",
    backgroundColor: "#FFFFFF",
  },
  chartCanvas: {
    position: "relative",
  },
  nodeHitArea: {
    position: "absolute",
    borderRadius: 3,
  },
  selectedNodeHitArea: {
    backgroundColor: "rgba(117, 101, 216, 0.15)",
    borderColor: "#624FC5",
    borderWidth: 3,
  },
  relatedNodeHitArea: {
    backgroundColor: "rgba(169, 155, 239, 0.08)",
    borderColor: "#9A8BEA",
    borderWidth: 2,
  },
  selectionLabel: {
    color: "#77758A",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
    minHeight: 16,
  },
});
