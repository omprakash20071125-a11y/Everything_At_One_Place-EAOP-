import React, { useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";

import type { Session } from "@supabase/supabase-js";

import { supabase } from "./src/lib/supabase";

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");

// ------------------------------------------------
// TYPES
// ------------------------------------------------

type Profile = {
  id: string;
  user_id: string;
  name: string;
  year: number;
  branch: string;
  semester: number;
  bio: string | null;
};

type Screen =
  | "auth"
  | "loading"
  | "profile"
  | "home"
  | "aboutIitJ"
  | "busSchedule"
  | "classroom"
  | "error";

type BusDay = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

type BusTrip = {
  id: number;
  bus_number: "B1" | "B2" | "B3";
  schedule_type: "regular" | "weekend_holiday";
  departure_time: string;
  origin: string;
  arrival_time: string;
  destination: string;
  route: string;
  source_page: number;
};

type ClassroomStatus = {
  connected: boolean;
  google_email: string | null;
  connected_at: string | null;
  scopes: string[];
};

type ClassroomCourse = {
  id: string;
  name: string | null;
  section: string | null;
  description: string | null;
  room: string | null;
  owner_id: string | null;
  course_state: string | null;
  alternate_link: string | null;
};

type ClassroomAssignment = {
  id: string;
  course_id: string;
  title: string | null;
  description: string | null;
  state: string | null;
  work_type: string | null;
  due_date: string | null;
  due_time: string | null;
  max_points: number | null;
  alternate_link: string | null;
  creation_time: string | null;
  update_time: string | null;
};

const BUS_DAYS: { label: string; value: BusDay }[] = [
  { label: "MON", value: "MON" },
  { label: "TUE", value: "TUE" },
  { label: "WED", value: "WED" },
  { label: "THU", value: "THU" },
  { label: "FRI", value: "FRI" },
  { label: "SAT", value: "SAT" },
  { label: "SUN", value: "SUN" },
];

const EMPTY_CLASSROOM_STATUS: ClassroomStatus = {
  connected: false,
  google_email: null,
  connected_at: null,
  scopes: [],
};

function getTodayBusDay(): BusDay {
  const days: BusDay[] = [
    "SUN",
    "MON",
    "TUE",
    "WED",
    "THU",
    "FRI",
    "SAT",
  ];

  return days[new Date().getDay()];
}

function formatBusTime(value: string): string {
  const [hoursPart, minutesPart] = value.split(":");
  const hours = Number(hoursPart);

  if (!Number.isFinite(hours) || !minutesPart) {
    return value;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${minutesPart.slice(0, 2)} ${period}`;
}

function formatDueDate(date: string | null, time: string | null): string {
  if (!date) return "No due date";

  const parsed = new Date(`${date}T${time || "23:59:00"}`);
  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: time ? "short" : undefined,
  });
}

// ------------------------------------------------
// APP CONTENT
// ------------------------------------------------

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [mode, setMode] = useState<"login" | "register">("login");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Authentication fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Profile fields
  const [name, setName] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [branch, setBranch] = useState("");
  const [semester, setSemester] = useState<number | null>(null);
  const [bio, setBio] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);

  // Bus schedule state
  const [selectedBusDay, setSelectedBusDay] = useState<BusDay>(getTodayBusDay);
  const [busTrips, setBusTrips] = useState<BusTrip[]>([]);
  const [busLoading, setBusLoading] = useState(false);
  const [busError, setBusError] = useState("");
  const [busRefreshKey, setBusRefreshKey] = useState(0);

  // Google Classroom state
  const [classroomStatus, setClassroomStatus] =
    useState<ClassroomStatus>(EMPTY_CLASSROOM_STATUS);
  const [classroomCourses, setClassroomCourses] =
    useState<ClassroomCourse[]>([]);
  const [selectedCourse, setSelectedCourse] =
    useState<ClassroomCourse | null>(null);
  const [classroomAssignments, setClassroomAssignments] =
    useState<ClassroomAssignment[]>([]);
  const [classroomLoading, setClassroomLoading] = useState(false);
  const [classroomActionLoading, setClassroomActionLoading] = useState(false);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [classroomError, setClassroomError] = useState("");
  const [classroomNotice, setClassroomNotice] = useState("");

  // ------------------------------------------------
  // SHARED CLASSROOM API REQUEST
  // ------------------------------------------------

  async function classroomRequest<T>(
    path: string,
    method: "GET" | "POST" | "DELETE" = "GET"
  ): Promise<T> {
    if (!API_URL) {
      throw new Error("Backend API URL is missing.");
    }

    if (!session) {
      throw new Error("Please sign in to EAOP first.");
    }

    const response = await fetch(
      `${API_URL}/api/v1/classroom${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );

    const result: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const detail =
        typeof result === "object" &&
        result !== null &&
        "detail" in result
          ? String(result.detail)
          : `Classroom request failed (${response.status}).`;

      throw new Error(detail);
    }

    return result as T;
  }

  // ------------------------------------------------
  // 1. CHECK AUTHENTICATION SESSION
  // ------------------------------------------------
  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        Alert.alert("Session error", error.message);
      }

      setSession(data.session);
      setScreen(data.session ? "loading" : "auth");
    }

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ------------------------------------------------
  // 2. CHECK WHETHER PROFILE EXISTS
  // ------------------------------------------------

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setScreen("auth");
      return;
    }

    const currentSession = session;
    let mounted = true;

    async function checkProfile() {
      setScreen("loading");

      try {
        if (!API_URL) {
          throw new Error("Backend API URL is missing.");
        }

        const response = await fetch(`${API_URL}/api/v1/profiles/me`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${currentSession.access_token}`,
          },
        });

        if (!mounted) return;

        if (response.status === 404) {
          setName(currentSession.user.user_metadata?.full_name || "");
          setScreen("profile");
          return;
        }

        const result: unknown = await response.json();

        if (!response.ok) {
          const detail =
            typeof result === "object" && result !== null && "detail" in result
              ? String(result.detail)
              : "Unable to fetch profile.";
          throw new Error(detail);
        }

        setProfile(result as Profile);
        setScreen("home");
      } catch (error) {
        if (!mounted) return;

        setErrorMessage(
          error instanceof Error ? error.message : "Something went wrong."
        );
        setScreen("error");
      }
    }

    checkProfile();

    return () => {
      mounted = false;
    };
  }, [session]);

  // ------------------------------------------------
  // 3. FETCH BUS SCHEDULE FROM FASTAPI
  // ------------------------------------------------

  useEffect(() => {
    if (screen !== "busSchedule") return;

    let mounted = true;

    async function fetchBusSchedule() {
      setBusLoading(true);
      setBusError("");
      setBusTrips([]);

      try {
        if (!API_URL) {
          throw new Error("Backend API URL is missing.");
        }

        const response = await fetch(
          `${API_URL}/api/v1/bus-schedule/day/${selectedBusDay}`
        );

        const result: unknown = await response.json();

        if (!response.ok) {
          const detail =
            typeof result === "object" &&
            result !== null &&
            "detail" in result
              ? String(result.detail)
              : "Unable to fetch bus schedule.";

          throw new Error(detail);
        }

        if (!Array.isArray(result)) {
          throw new Error("Invalid bus schedule response from backend.");
        }

        if (!mounted) return;
        setBusTrips(result as BusTrip[]);
      } catch (error) {
        if (!mounted) return;

        setBusError(
          error instanceof Error ? error.message : "Something went wrong."
        );
      } finally {
        if (mounted) setBusLoading(false);
      }
    }

    fetchBusSchedule();

    return () => {
      mounted = false;
    };
  }, [screen, selectedBusDay, busRefreshKey]);

  // ------------------------------------------------
  // 4. LOAD GOOGLE CLASSROOM STATUS AND COURSES
  // ------------------------------------------------

  async function refreshClassroom() {
    const currentSession = session;
    if (!currentSession) return;

    setClassroomLoading(true);
    setClassroomError("");
    setClassroomNotice("");

    try {
      const status = await classroomRequest<ClassroomStatus>("/status");
      setClassroomStatus(status);

      const expectedEmail = currentSession.user.email?.trim().toLowerCase();
      const connectedEmail = status.google_email?.trim().toLowerCase();

      if (
        status.connected &&
        expectedEmail &&
        connectedEmail &&
        connectedEmail !== expectedEmail
      ) {
        setClassroomCourses([]);
        setSelectedCourse(null);
        setClassroomAssignments([]);
        throw new Error(
          `Google Classroom is connected as ${status.google_email}, but your EAOP account is ${currentSession.user.email}. Disconnect the Google account and reconnect using the EAOP email.`
        );
      }

      if (status.connected) {
        const courses = await classroomRequest<ClassroomCourse[]>("/courses");
        setClassroomCourses(courses);
      } else {
        setClassroomCourses([]);
        setSelectedCourse(null);
        setClassroomAssignments([]);
      }
    } catch (error) {
      setClassroomError(
        error instanceof Error ? error.message : "Unable to load Google Classroom."
      );
    } finally {
      setClassroomLoading(false);
    }
  }

  useEffect(() => {
    if (screen !== "classroom" || !session) return;

    const currentSession = session;
    let mounted = true;

    async function loadClassroom() {
      setClassroomLoading(true);
      setClassroomError("");

      try {
        const status = await classroomRequest<ClassroomStatus>("/status");
        if (!mounted) return;

        setClassroomStatus(status);

        const expectedEmail = currentSession.user.email?.trim().toLowerCase();
        const connectedEmail = status.google_email?.trim().toLowerCase();

        if (
          status.connected &&
          expectedEmail &&
          connectedEmail &&
          connectedEmail !== expectedEmail
        ) {
          setClassroomCourses([]);
          setSelectedCourse(null);
          setClassroomAssignments([]);
          throw new Error(
            `Google Classroom is connected as ${status.google_email}, but your EAOP account is ${currentSession.user.email}. Disconnect the Google account and reconnect using the EAOP email.`
          );
        }

        if (status.connected) {
          const courses = await classroomRequest<ClassroomCourse[]>("/courses");
          if (!mounted) return;
          setClassroomCourses(courses);
        } else {
          setClassroomCourses([]);
          setSelectedCourse(null);
          setClassroomAssignments([]);
        }
      } catch (error) {
        if (!mounted) return;
        setClassroomError(
          error instanceof Error ? error.message : "Unable to load Google Classroom."
        );
      } finally {
        if (mounted) setClassroomLoading(false);
      }
    }

    loadClassroom();

    return () => {
      mounted = false;
    };
  }, [screen, session]);

  // ------------------------------------------------
  // 5. CONNECT GOOGLE CLASSROOM
  // ------------------------------------------------

  async function handleConnectClassroom() {
    setClassroomActionLoading(true);
    setClassroomError("");
    setClassroomNotice("");

    try {
      const expectedEmail = session?.user.email?.trim().toLowerCase();

      if (!expectedEmail) {
        throw new Error(
          "Your EAOP account does not have an email address. Please sign in again."
        );
      }

      const result = await classroomRequest<{
        authorization_url: string;
      }>("/connect", "POST");

      if (!result.authorization_url) {
        throw new Error("Backend did not return a Google authorization URL.");
      }

      // Add the currently authenticated EAOP email as Google's account hint.
      // This helps Google select/prefill the same account, but it does not
      // replace Google's sign-in or account-selection process.
      const [authorizationBase, rawQuery = ""] =
        result.authorization_url.split("?");

      const preservedParams = rawQuery
        .split("&")
        .filter(Boolean)
        .filter((part) => {
          const key = part.split("=", 1)[0];
          return key !== "login_hint" && key !== "prompt" && key !== "hd";
        });

      const authorizationParams = [
        ...preservedParams,
        `login_hint=${encodeURIComponent(expectedEmail)}`,
        `prompt=${encodeURIComponent("select_account consent")}`,
      ];

      // IIT Jodhpur Workspace domain hint. This is a UI hint, not an access
      // restriction; Google may still require the user to choose/sign in.
      if (expectedEmail.endsWith("@iitj.ac.in")) {
        authorizationParams.push("hd=iitj.ac.in");
      }

      const hintedAuthorizationUrl =
        `${authorizationBase}?${authorizationParams.join("&")}`;

      await Linking.openURL(hintedAuthorizationUrl);

      setClassroomNotice(
        `Google sign-in opened for ${expectedEmail}. If Google shows another account, choose “Use another account” and sign in with ${expectedEmail}. After authorization, return to EAOP and tap Refresh courses.`
      );
    } catch (error) {
      setClassroomError(
        error instanceof Error ? error.message : "Unable to start Google sign-in."
      );
    } finally {
      setClassroomActionLoading(false);
    }
  }

  // ------------------------------------------------
  // 6. FETCH ASSIGNMENTS FOR A COURSE
  // ------------------------------------------------

  async function handleSelectCourse(course: ClassroomCourse) {
    setSelectedCourse(course);
    setClassroomAssignments([]);
    setClassroomError("");
    setAssignmentsLoading(true);

    try {
      const assignments = await classroomRequest<ClassroomAssignment[]>(
        `/courses/${encodeURIComponent(course.id)}/assignments`
      );
      setClassroomAssignments(assignments);
    } catch (error) {
      setClassroomError(
        error instanceof Error ? error.message : "Unable to fetch assignments."
      );
    } finally {
      setAssignmentsLoading(false);
    }
  }

  // ------------------------------------------------
  // 7. DISCONNECT GOOGLE CLASSROOM
  // ------------------------------------------------

  function handleDisconnectClassroom() {
    Alert.alert(
      "Disconnect Google Classroom?",
      "EAOP will remove the saved Google Classroom connection. You can connect again later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setClassroomActionLoading(true);
            setClassroomError("");

            try {
              await classroomRequest<{ disconnected: boolean }>(
                "/disconnect",
                "DELETE"
              );

              setClassroomStatus(EMPTY_CLASSROOM_STATUS);
              setClassroomCourses([]);
              setSelectedCourse(null);
              setClassroomAssignments([]);
              setClassroomNotice("Google Classroom has been disconnected.");
            } catch (error) {
              setClassroomError(
                error instanceof Error ? error.message : "Unable to disconnect."
              );
            } finally {
              setClassroomActionLoading(false);
            }
          },
        },
      ]
    );
  }

  // ------------------------------------------------
  // 8. LOGIN / SIGNUP
  // ------------------------------------------------

  async function handleAuthentication() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      Alert.alert("Missing details", "Enter your email and password.");
      return;
    }

    if (mode === "register" && !fullName.trim()) {
      Alert.alert("Missing name", "Enter your full name.");
      return;
    }

    if (password.length < 8) {
      Alert.alert(
        "Invalid password",
        "Password must contain at least 8 characters."
      );
      return;
    }

    setLoading(true);

    try {
      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (error) throw error;

        if (!data.session) {
          Alert.alert(
            "Verify your email",
            "Check your email, verify your account, and then log in."
          );
        } else {
          Alert.alert("Account created", "Welcome to EAOP!");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) throw error;
      }
    } catch (error) {
      Alert.alert(
        "Authentication failed",
        error instanceof Error ? error.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------------
  // 9. CREATE STUDENT PROFILE
  // ------------------------------------------------

  async function handleCreateProfile() {
    if (!session || !API_URL) {
      Alert.alert(
        "Configuration error",
        "Authentication or backend URL is missing."
      );
      return;
    }

    if (!name.trim() || !year || !branch.trim() || !semester) {
      Alert.alert(
        "Incomplete profile",
        "Please fill in your name, year, branch and semester."
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/v1/profiles/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          year,
          branch: branch.trim(),
          semester,
          bio: bio.trim() || null,
        }),
      });

      const result: unknown = await response.json();

      if (!response.ok) {
        const detail =
          typeof result === "object" && result !== null && "detail" in result
            ? String(result.detail)
            : "Unable to create profile.";
        throw new Error(detail);
      }

      setProfile(result as Profile);
      setScreen("home");

      Alert.alert(
        "Profile completed!",
        "Your EAOP profile has been created successfully."
      );
    } catch (error) {
      Alert.alert(
        "Profile error",
        error instanceof Error ? error.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------------
  // 10. LOGOUT
  // ------------------------------------------------

  async function logout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert("Logout failed", error.message);
    }
  }

  // ------------------------------------------------
  // 11. REUSABLE OPTION BUTTON
  // ------------------------------------------------

  function OptionButton({
    label,
    selected,
    onPress,
  }: {
    label: string;
    selected: boolean;
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        style={[styles.option, selected && styles.selectedOption]}
      >
        <Text
          style={[
            styles.optionText,
            selected && styles.selectedOptionText,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  }

  // ------------------------------------------------
  // 12. LOADING SCREEN
  // ------------------------------------------------

  if (screen === "loading") {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color="#7565D8" />
        <Text style={styles.loadingText}>
          Preparing your EAOP experience...
        </Text>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------
  // 13. ERROR SCREEN
  // ------------------------------------------------

  if (screen === "error") {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.logo}>EAOP.</Text>
        <Text style={styles.heading}>Something went wrong</Text>
        <Text style={styles.subtitle}>{errorMessage}</Text>

        <Pressable
          style={styles.button}
          onPress={() => {
            if (session) {
              setScreen("loading");
              setSession({ ...session });
            }
          }}
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>

        <Pressable onPress={logout} style={styles.modeButton}>
          <Text style={styles.modeText}>Log out</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------
  // 14. LOGIN / SIGNUP SCREEN
  // ------------------------------------------------

  if (screen === "auth") {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.authContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.brandContainer}>
              <Text style={styles.logo}>EAOP.</Text>
              <View style={styles.brandLine} />
              <Text style={styles.brandTagline}>YOUR CAMPUS. YOUR WAY.</Text>
            </View>

            <Text style={styles.heading}>
              {mode === "login" ? "Welcome back." : "Let's get started."}
            </Text>

            <Text style={styles.subtitle}>
              {mode === "login"
                ? "Sign in to continue your campus journey."
                : "Create your account and make college life easier."}
            </Text>

            {mode === "register" && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>FULL NAME</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Your full name"
                  placeholderTextColor="#A5A2B4"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>EMAIL ADDRESS</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#A5A2B4"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#A5A2B4"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <Pressable
              style={[styles.button, loading && styles.disabled]}
              onPress={handleAuthentication}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading
                  ? "Please wait..."
                  : mode === "login"
                    ? "Sign in"
                    : "Create account"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.modeButton}
              onPress={() =>
                setMode(mode === "login" ? "register" : "login")
              }
            >
              <Text style={styles.modeText}>
                {mode === "login"
                  ? "New to EAOP? Create an account"
                  : "Already have an account? Sign in"}
              </Text>
            </Pressable>

            <Text style={styles.footerText}>
              MADE FOR STUDENTS, BY STUDENTS.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------
  // 15. PROFILE ONBOARDING SCREEN
  // ------------------------------------------------

  if (screen === "profile") {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.profileContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.logo}>EAOP.</Text>
            <Text style={styles.stepText}>STEP 01 / PROFILE SETUP</Text>
            <Text style={styles.heading}>Tell us about yourself.</Text>
            <Text style={styles.subtitle}>
              Let's personalize your campus experience.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>FULL NAME *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                placeholderTextColor="#A5A2B4"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            <Text style={styles.label}>ACADEMIC YEAR *</Text>
            <View style={styles.optionsContainer}>
              {[1, 2, 3, 4].map((item) => (
                <OptionButton
                  key={item}
                  label={`Year ${item}`}
                  selected={year === item}
                  onPress={() => setYear(item)}
                />
              ))}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>BRANCH *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Computer Science and Engineering"
                placeholderTextColor="#A5A2B4"
                value={branch}
                onChangeText={setBranch}
                autoCapitalize="words"
              />
            </View>

            <Text style={styles.label}>CURRENT SEMESTER *</Text>
            <View style={styles.optionsContainer}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
                <OptionButton
                  key={item}
                  label={`${item}`}
                  selected={semester === item}
                  onPress={() => setSemester(item)}
                />
              ))}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>ABOUT YOU</Text>
              <TextInput
                style={[styles.input, styles.bioInput]}
                placeholder="Tell us about your interests, skills and goals..."
                placeholderTextColor="#A5A2B4"
                value={bio}
                onChangeText={setBio}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />
              <Text style={styles.characterCount}>{bio.length}/500</Text>
            </View>

            <Pressable
              style={[styles.button, loading && styles.disabled]}
              onPress={handleCreateProfile}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Complete Profile →</Text>
              )}
            </Pressable>

            <Pressable style={styles.modeButton} onPress={logout}>
              <Text style={styles.modeText}>Log out</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------
  // 16. BUS SCHEDULE SCREEN
  // ------------------------------------------------

  if (screen === "busSchedule") {
    const selectedDayLabel =
      BUS_DAYS.find((day) => day.value === selectedBusDay)?.label ??
      selectedBusDay;

    const isWeekend =
      selectedBusDay === "SAT" || selectedBusDay === "SUN";

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />

        <ScrollView contentContainerStyle={styles.busScreenContent}>
          <View style={styles.busHeader}>
            <Pressable
              onPress={() => setScreen("home")}
              style={styles.backButton}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </Pressable>
            <Text style={styles.logo}>EAOP.</Text>
          </View>

          <Text style={styles.heading}>Bus Schedule</Text>
          <Text style={styles.subtitle}>
            Find your institute bus timings and routes.
          </Text>

          <Text style={styles.label}>SELECT DAY</Text>

          <View style={styles.busDaysContainer}>
            {BUS_DAYS.map((day) => {
              const selected = selectedBusDay === day.value;

              return (
                <Pressable
                  key={day.value}
                  accessibilityRole="button"
                  accessibilityLabel={`${day.label} bus schedule`}
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedBusDay(day.value)}
                  style={[
                    styles.busDayButton,
                    selected && styles.busDayButtonSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.busDayText,
                      selected && styles.busDayTextSelected,
                    ]}
                  >
                    {day.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.busScheduleHeader}>
            <View style={styles.busScheduleHeadingText}>
              <Text style={styles.sectionTitle}>
                {selectedDayLabel}'s Schedule
              </Text>
              <Text style={styles.busScheduleSubtitle}>
                {isWeekend
                  ? "Saturday, Sunday & institute holidays"
                  : "Monday to Friday"}
              </Text>
            </View>

            <View style={styles.busScheduleBadge}>
              <Text style={styles.busScheduleBadgeText}>
                {isWeekend ? "WEEKEND" : "REGULAR"}
              </Text>
            </View>
          </View>

          {busLoading && (
            <View style={styles.busMessage}>
              <ActivityIndicator size="large" color="#7565D8" />
              <Text style={styles.busMessageText}>
                Loading bus schedule...
              </Text>
            </View>
          )}

          {!busLoading && busError !== "" && (
            <View style={styles.busMessage}>
              <Text style={styles.busErrorText}>{busError}</Text>
              <Pressable
                style={styles.button}
                onPress={() => setBusRefreshKey((key) => key + 1)}
              >
                <Text style={styles.buttonText}>Try Again</Text>
              </Pressable>
            </View>
          )}

          {!busLoading && !busError && busTrips.length === 0 && (
            <View style={styles.busMessage}>
              <Text style={styles.busEmptyTitle}>No buses found</Text>
              <Text style={styles.busMessageText}>
                No bus trips are available for this day.
              </Text>
            </View>
          )}

          {!busLoading &&
            !busError &&
            (["B1", "B2", "B3"] as const).map((busNumber) => {
              const tripsForBus = busTrips
                .filter((trip) => trip.bus_number === busNumber)
                .sort((a, b) =>
                  a.departure_time.localeCompare(b.departure_time)
                );

              if (tripsForBus.length === 0) return null;

              return (
                <View key={busNumber} style={styles.busGroupCard}>
                  <View style={styles.busGroupHeader}>
                    <Text style={styles.busGroupTitle}>Bus {busNumber}</Text>
                    <Text style={styles.busTripCount}>
                      {tripsForBus.length} trips
                    </Text>
                  </View>

                  {tripsForBus.map((trip) => (
                    <View key={trip.id} style={styles.busTripItem}>
                      <View style={styles.busTripTopRow}>
                        <View style={styles.busTimeColumn}>
                          <Text style={styles.busDepartureTime}>
                            {formatBusTime(trip.departure_time)}
                          </Text>
                          <Text style={styles.busLocation}>{trip.origin}</Text>
                          <Text style={styles.busTimeLabel}>DEPARTURE</Text>
                        </View>

                        <View style={styles.busArrowContainer}>
                          <Text style={styles.busArrow}>→</Text>
                        </View>

                        <View
                          style={[
                            styles.busTimeColumn,
                            { alignItems: "flex-end" },
                          ]}
                        >
                          <Text style={styles.busArrivalTime}>
                            {formatBusTime(trip.arrival_time)}
                          </Text>
                          <Text
                            style={[
                              styles.busLocation,
                              { textAlign: "right" },
                            ]}
                          >
                            {trip.destination}
                          </Text>
                          <Text style={styles.busTimeLabel}>ARRIVAL</Text>
                        </View>
                      </View>

                      <View style={styles.busRouteContainer}>
                        <Text style={styles.busRouteLabel}>ROUTE</Text>
                        <Text style={styles.busRoute}>{trip.route}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}

          <Text style={styles.footerText}>
            MADE FOR STUDENTS, BY STUDENTS.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------
  // 17. GOOGLE CLASSROOM SCREEN
  // ------------------------------------------------

  if (screen === "classroom") {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />

        <ScrollView contentContainerStyle={styles.classroomScreenContent}>
          <View style={styles.busHeader}>
            <Pressable
              onPress={() => {
                setSelectedCourse(null);
                setClassroomAssignments([]);
                setScreen("home");
              }}
              style={styles.backButton}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </Pressable>
            <Text style={styles.logo}>EAOP.</Text>
          </View>

          <Text style={styles.heading}>Google Classroom</Text>
          <Text style={styles.subtitle}>
            Access your courses and assignments in one place.
          </Text>

          <View style={styles.classroomConnectionCard}>
            <View style={styles.classroomConnectionTop}>
              <View style={styles.classroomIcon}>
                <Text style={styles.classroomIconText}>G</Text>
              </View>
              <View style={styles.classroomConnectionInfo}>
                <Text style={styles.classroomConnectionTitle}>
                  {classroomStatus.connected
                    ? "Google account connected"
                    : "Connect Google Classroom"}
                </Text>
                <Text style={styles.classroomConnectionEmail}>
                  {classroomStatus.connected
                    ? classroomStatus.google_email
                    : "Connect your student Google account to view courses."}
                </Text>
              </View>
            </View>

            {!classroomStatus.connected ? (
              <Pressable
                style={[
                  styles.button,
                  classroomActionLoading && styles.disabled,
                ]}
                onPress={handleConnectClassroom}
                disabled={classroomActionLoading}
              >
                {classroomActionLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>
                    Connect Google Classroom
                  </Text>
                )}
              </Pressable>
            ) : (
              <View style={styles.classroomActionsRow}>
                <Pressable
                  style={[styles.classroomSecondaryButton, { flex: 1 }]}
                  onPress={refreshClassroom}
                  disabled={classroomLoading || classroomActionLoading}
                >
                  <Text style={styles.classroomSecondaryButtonText}>
                    Refresh courses
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.classroomDisconnectButton, { flex: 1 }]}
                  onPress={handleDisconnectClassroom}
                  disabled={classroomActionLoading}
                >
                  <Text style={styles.classroomDisconnectText}>
                    Disconnect
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {classroomNotice !== "" && (
            <View style={styles.classroomNoticeBox}>
              <Text style={styles.classroomNoticeText}>
                {classroomNotice}
              </Text>
              <Pressable
                onPress={refreshClassroom}
                style={styles.classroomInlineAction}
              >
                <Text style={styles.classroomInlineActionText}>
                  I've completed sign-in — refresh connection
                </Text>
              </Pressable>
            </View>
          )}

          {classroomError !== "" && (
            <View style={styles.classroomErrorBox}>
              <Text style={styles.classroomErrorText}>
                {classroomError}
              </Text>
              <Pressable onPress={refreshClassroom}>
                <Text style={styles.classroomInlineActionText}>Try again</Text>
              </Pressable>
            </View>
          )}

          {classroomLoading && (
            <View style={styles.busMessage}>
              <ActivityIndicator size="large" color="#7565D8" />
              <Text style={styles.busMessageText}>
                Loading Google Classroom...
              </Text>
            </View>
          )}

          {!classroomLoading &&
            classroomStatus.connected &&
            !selectedCourse && (
              <>
                <View style={styles.classroomSectionHeader}>
                  <Text style={styles.sectionTitle}>Your Courses</Text>
                  <Text style={styles.classroomCount}>
                    {classroomCourses.length} courses
                  </Text>
                </View>

                {classroomCourses.length === 0 ? (
                  <View style={styles.busMessage}>
                    <Text style={styles.busEmptyTitle}>No courses found</Text>
                    <Text style={styles.busMessageText}>
                      No courses were returned for this Google account.
                    </Text>
                  </View>
                ) : (
                  classroomCourses.map((course) => (
                    <Pressable
                      key={course.id}
                      style={styles.classroomCourseCard}
                      onPress={() => handleSelectCourse(course)}
                    >
                      <View style={styles.classroomCourseTop}>
                        <View style={styles.classroomCourseMark}>
                          <Text style={styles.classroomCourseMarkText}>
                            {(course.name || "C").charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.classroomCourseInfo}>
                          <Text style={styles.classroomCourseName}>
                            {course.name || "Untitled course"}
                          </Text>
                          {!!course.section && (
                            <Text style={styles.classroomCourseMeta}>
                              {course.section}
                            </Text>
                          )}
                          {!!course.room && (
                            <Text style={styles.classroomCourseMeta}>
                              Room: {course.room}
                            </Text>
                          )}
                        </View>
                        <Text style={styles.classroomCourseChevron}>›</Text>
                      </View>
                      {!!course.description && (
                        <Text
                          numberOfLines={2}
                          style={styles.classroomCourseDescription}
                        >
                          {course.description}
                        </Text>
                      )}
                      <Text style={styles.classroomCourseAction}>
                        VIEW ASSIGNMENTS →
                      </Text>
                    </Pressable>
                  ))
                )}
              </>
            )}

          {!classroomLoading && selectedCourse && (
            <>
              <Pressable
                style={styles.classroomBackToCourses}
                onPress={() => {
                  setSelectedCourse(null);
                  setClassroomAssignments([]);
                  setClassroomError("");
                }}
              >
                <Text style={styles.classroomInlineActionText}>
                  ← Back to courses
                </Text>
              </Pressable>

              <Text style={styles.sectionTitle}>
                {selectedCourse.name || "Course assignments"}
              </Text>

              {!!selectedCourse.section && (
                <Text style={styles.classroomCourseMeta}>
                  {selectedCourse.section}
                </Text>
              )}

              {assignmentsLoading ? (
                <View style={styles.busMessage}>
                  <ActivityIndicator size="large" color="#7565D8" />
                  <Text style={styles.busMessageText}>
                    Loading assignments...
                  </Text>
                </View>
              ) : classroomAssignments.length === 0 ? (
                <View style={styles.busMessage}>
                  <Text style={styles.busEmptyTitle}>
                    No assignments found
                  </Text>
                  <Text style={styles.busMessageText}>
                    This course has no coursework available to display.
                  </Text>
                </View>
              ) : (
                classroomAssignments.map((assignment) => (
                  <View
                    key={assignment.id}
                    style={styles.classroomAssignmentCard}
                  >
                    <Text style={styles.classroomAssignmentTitle}>
                      {assignment.title || "Untitled assignment"}
                    </Text>
                    <Text style={styles.classroomAssignmentMeta}>
                      {assignment.work_type || "Coursework"} · {assignment.state || "Published"}
                    </Text>
                    {!!assignment.description && (
                      <Text style={styles.classroomAssignmentDescription}>
                        {assignment.description}
                      </Text>
                    )}
                    {assignment.due_date && (
                      <View style={styles.classroomDueRow}>
                        <Text style={styles.classroomDueLabel}>DUE</Text>
                        <Text style={styles.classroomDueValue}>
                          {formatDueDate(
                            assignment.due_date,
                            assignment.due_time
                          )}
                        </Text>
                      </View>
                    )}
                    {assignment.max_points !== null && (
                      <Text style={styles.classroomAssignmentMeta}>
                        Maximum points: {assignment.max_points}
                      </Text>
                    )}
                    {!!assignment.alternate_link && (
                      <Pressable
                        style={styles.classroomInlineAction}
                        onPress={() =>
                          Linking.openURL(assignment.alternate_link!).catch(() =>
                            Alert.alert(
                              "Unable to open assignment",
                              "The assignment link could not be opened."
                            )
                          )
                        }
                      >
                        <Text style={styles.classroomInlineActionText}>
                          Open in Google Classroom →
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ))
              )}
            </>
          )}

          <Text style={styles.footerText}>
            MADE FOR STUDENTS, BY STUDENTS.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "aboutIitJ") {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.busScreenContent}>
          <View style={styles.busHeader}>
            <Pressable
              style={styles.backButton}
              onPress={() => setScreen("home")}
              accessibilityRole="button"
              accessibilityLabel="Back to home"
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </Pressable>
            <Text style={styles.logo}>EAOP.</Text>
          </View>

          <Pressable style={styles.featureCard} accessibilityRole="button">
            <Text style={styles.featureTitle}>Student Gymkhana</Text>
          </Pressable>

          <Pressable style={styles.featureCard} accessibilityRole="button">
            <Text style={styles.featureTitle}>Campus Fests</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView contentContainerStyle={styles.homeContent}>
        <View style={styles.homeHeader}>
          <View>
            <Text style={styles.logo}>EAOP.</Text>
            <Text style={styles.smallText}>YOUR CAMPUS COMPANION</Text>
          </View>

          <Pressable style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>

        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeLabel}>WELCOME TO EAOP</Text>
          <Text style={styles.welcomeTitle}>
            Hey, {profile?.name || "Student"}!
          </Text>
          <Text style={styles.welcomeSubtitle}>
            Your campus journey starts here.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Your Academic Profile</Text>

        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.avatarText}>
              {profile?.name?.charAt(0).toUpperCase() || "S"}
            </Text>
          </View>

          <Text style={styles.profileName}>{profile?.name}</Text>
          <Text style={styles.profileBio}>
            {profile?.bio || "No bio added yet."}
          </Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoBox}>
              <Text style={styles.infoValue}>{profile?.year}</Text>
              <Text style={styles.infoLabel}>YEAR</Text>
            </View>
            <View style={styles.infoBox}>
              <Text style={styles.infoValue}>{profile?.semester}</Text>
              <Text style={styles.infoLabel}>SEMESTER</Text>
            </View>
          </View>

          <Text style={styles.branchText}>{profile?.branch}</Text>
        </View>

        <Text style={styles.sectionTitle}>Your Campus Space</Text>

        <Pressable
          style={styles.featureCard}
          onPress={() => setScreen("busSchedule")}
        >
          <Text style={styles.featureNumber}>01</Text>
          <Text style={styles.featureTitle}>Bus Schedule</Text>
          <Text style={styles.featureDescription}>
            Check institute bus timings, routes and daily schedules.
          </Text>
          <Text style={styles.comingSoon}>VIEW BUS TIMETABLE →</Text>
        </Pressable>

        <Pressable
          style={styles.featureCard}
          onPress={() => {
            setClassroomError("");
            setClassroomNotice("");
            setSelectedCourse(null);
            setClassroomAssignments([]);
            setScreen("classroom");
          }}
        >
          <Text style={styles.featureNumber}>02</Text>
          <Text style={styles.featureTitle}>Google Classroom</Text>
          <Text style={styles.featureDescription}>
            View your courses, assignments and academic deadlines.
          </Text>
          <Text style={styles.comingSoon}>OPEN CLASSROOM →</Text>
        </Pressable>

        <Pressable
          style={styles.featureCard}
          onPress={() => setScreen("aboutIitJ")}
          accessibilityRole="button"
        >
          <Text style={styles.featureNumber}>03</Text>
          <Text style={styles.featureTitle}>About IIT J</Text>
          <Text style={styles.featureDescription}>
            Everything about college student structure, at one place
          </Text>
          <Text style={styles.comingSoon}>UNDERSTAND CAMPUS →</Text>
        </Pressable>

        <Text style={styles.footerText}>
          MADE FOR STUDENTS, BY STUDENTS.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ------------------------------------------------
// STYLES
// ------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F6FC",
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
    backgroundColor: "#F7F6FC",
  },

  authContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 40,
  },

  profileContent: {
    paddingHorizontal: 25,
    paddingVertical: 35,
    paddingBottom: 50,
  },

  homeContent: {
    padding: 25,
    paddingBottom: 50,
  },

  brandContainer: {
    marginBottom: 55,
  },

  logo: {
    fontSize: 32,
    fontWeight: "900",
    color: "#7565D8",
    letterSpacing: 3,
    marginBottom: 12,
  },

  brandLine: {
    height: 2,
    width: 45,
    backgroundColor: "#7565D8",
    marginBottom: 12,
  },

  brandTagline: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#77758A",
    fontWeight: "700",
  },

  heading: {
    fontSize: 31,
    fontWeight: "800",
    color: "#202033",
    marginBottom: 10,
    letterSpacing: -0.8,
  },

  subtitle: {
    fontSize: 14,
    color: "#77758A",
    lineHeight: 22,
    marginBottom: 32,
  },

  stepText: {
    color: "#7565D8",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 15,
  },

  inputGroup: {
    marginBottom: 22,
  },

  label: {
    color: "#77758A",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 10,
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E2F0",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 14,
    color: "#202033",
  },

  bioInput: {
    minHeight: 120,
    paddingTop: 16,
  },

  characterCount: {
    textAlign: "right",
    fontSize: 11,
    color: "#9995AA",
    marginTop: 6,
  },

  button: {
    backgroundColor: "#7565D8",
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 12,
  },

  disabled: {
    opacity: 0.6,
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  modeButton: {
    alignItems: "center",
    marginTop: 25,
    padding: 10,
  },

  modeText: {
    color: "#7565D8",
    fontWeight: "700",
    fontSize: 13,
  },

  optionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 25,
  },

  option: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E2F0",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    minWidth: 65,
    alignItems: "center",
  },

  selectedOption: {
    backgroundColor: "#7565D8",
    borderColor: "#7565D8",
  },

  optionText: {
    color: "#55536A",
    fontWeight: "600",
    fontSize: 13,
  },

  selectedOptionText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  footerText: {
    color: "#A5A2B4",
    fontSize: 9,
    letterSpacing: 2,
    textAlign: "center",
    marginTop: 45,
  },

  loadingText: {
    color: "#77758A",
    marginTop: 18,
    fontSize: 14,
  },

  homeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
  },

  smallText: {
    fontSize: 9,
    letterSpacing: 2,
    color: "#9995AA",
    fontWeight: "700",
  },

  logoutButton: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E2F0",
  },

  logoutText: {
    color: "#7565D8",
    fontWeight: "700",
    fontSize: 12,
  },

  welcomeCard: {
    backgroundColor: "#29253B",
    padding: 25,
    borderRadius: 22,
    marginBottom: 35,
  },

  welcomeLabel: {
    color: "#B9ADEE",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 15,
  },

  welcomeTitle: {
    fontSize: 29,
    color: "#FFFFFF",
    fontWeight: "800",
    marginBottom: 8,
  },

  welcomeSubtitle: {
    fontSize: 13,
    color: "#D0CBE1",
  },

  sectionTitle: {
    color: "#202033",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 18,
  },

  profileCard: {
    backgroundColor: "#FFFFFF",
    padding: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#EAE7F2",
    alignItems: "center",
    marginBottom: 35,
  },

  profileAvatar: {
    width: 65,
    height: 65,
    borderRadius: 33,
    backgroundColor: "#EAE5FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },

  avatarText: {
    color: "#7565D8",
    fontSize: 26,
    fontWeight: "800",
  },

  profileName: {
    fontSize: 20,
    color: "#202033",
    fontWeight: "800",
  },

  profileBio: {
    fontSize: 13,
    color: "#77758A",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },

  infoGrid: {
    flexDirection: "row",
    gap: 15,
    marginTop: 22,
    width: "100%",
  },

  infoBox: {
    flex: 1,
    backgroundColor: "#F7F6FC",
    borderRadius: 13,
    padding: 15,
    alignItems: "center",
  },

  infoValue: {
    color: "#7565D8",
    fontSize: 23,
    fontWeight: "800",
  },

  infoLabel: {
    color: "#9995AA",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 5,
  },

  branchText: {
    color: "#55536A",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 18,
  },

  featureCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 22,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#EAE7F2",
  },

  featureNumber: {
    color: "#7565D8",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 12,
  },

  featureTitle: {
    color: "#202033",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },

  featureDescription: {
    color: "#77758A",
    fontSize: 13,
    lineHeight: 20,
  },

  comingSoon: {
    color: "#7565D8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 18,
  },

  // BUS SCHEDULE STYLES
  busScreenContent: {
    padding: 25,
    paddingBottom: 50,
  },

  busHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 25,
  },

  backButton: {
    paddingVertical: 10,
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

  busDaysContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignSelf: "stretch",
    width: "100%",
    paddingBottom: 25,
  },

  busDayButton: {
    flex: 1,
    minWidth: 0,
    height: 44,
    marginHorizontal: 2,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E2F0",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 0,
  },

  busDayButtonSelected: {
    backgroundColor: "#7565D8",
    borderColor: "#7565D8",
  },

  busDayText: {
    color: "#55536A",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.1,
  },

  busDayTextSelected: {
    color: "#FFFFFF",
  },

  busScheduleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },

  busScheduleHeadingText: {
    flex: 1,
  },

  busScheduleSubtitle: {
    color: "#9995AA",
    fontSize: 11,
    marginTop: -10,
    marginBottom: 15,
  },

  busScheduleBadge: {
    backgroundColor: "#EAE5FF",
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
    marginLeft: 8,
  },

  busScheduleBadgeText: {
    color: "#7565D8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  busGroupCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EAE7F2",
    borderRadius: 18,
    padding: 17,
    marginBottom: 18,
  },

  busGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  busGroupTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#29253B",
  },

  busTripCount: {
    fontSize: 11,
    color: "#7565D8",
    fontWeight: "700",
  },

  busTripItem: {
    borderTopWidth: 1,
    borderTopColor: "#F0EDF6",
    paddingTop: 17,
    paddingBottom: 17,
  },

  busTripTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  busTimeColumn: {
    flex: 1,
    gap: 5,
  },

  busDepartureTime: {
    fontSize: 21,
    color: "#7565D8",
    fontWeight: "800",
  },

  busArrivalTime: {
    fontSize: 21,
    color: "#29253B",
    fontWeight: "800",
  },

  busLocation: {
    fontSize: 12,
    color: "#55536A",
    fontWeight: "600",
  },

  busTimeLabel: {
    fontSize: 8,
    color: "#AAA5B9",
    fontWeight: "800",
    letterSpacing: 1,
  },

  busArrowContainer: {
    paddingHorizontal: 10,
  },

  busArrow: {
    fontSize: 23,
    color: "#A5A2B4",
  },

  busRouteContainer: {
    backgroundColor: "#F7F6FC",
    padding: 12,
    borderRadius: 11,
    marginTop: 14,
  },

  busRouteLabel: {
    fontSize: 9,
    color: "#7565D8",
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 6,
  },

  busRoute: {
    fontSize: 12,
    color: "#55536A",
    lineHeight: 20,
  },

  busMessage: {
    padding: 25,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginTop: 10,
  },

  busMessageText: {
    color: "#77758A",
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },

  busErrorText: {
    color: "#D14343",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
  },

  busEmptyTitle: {
    color: "#29253B",
    fontSize: 17,
    fontWeight: "800",
  },

  // GOOGLE CLASSROOM STYLES
  classroomScreenContent: {
    padding: 25,
    paddingBottom: 50,
  },

  classroomConnectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#EAE7F2",
    marginBottom: 25,
  },

  classroomConnectionTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  classroomIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#EAE5FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },

  classroomIconText: {
    color: "#7565D8",
    fontSize: 25,
    fontWeight: "900",
  },

  classroomConnectionInfo: {
    flex: 1,
  },

  classroomConnectionTitle: {
    color: "#202033",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 5,
  },

  classroomConnectionEmail: {
    color: "#77758A",
    fontSize: 12,
    lineHeight: 18,
  },

  classroomActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },

  classroomSecondaryButton: {
    backgroundColor: "#7565D8",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },

  classroomSecondaryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  classroomDisconnectButton: {
    backgroundColor: "#FFF0F0",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },

  classroomDisconnectText: {
    color: "#C53D3D",
    fontSize: 12,
    fontWeight: "800",
  },

  classroomNoticeBox: {
    backgroundColor: "#F0EDFF",
    borderRadius: 13,
    padding: 14,
    marginBottom: 18,
  },

  classroomNoticeText: {
    color: "#55536A",
    fontSize: 12,
    lineHeight: 19,
  },

  classroomErrorBox: {
    backgroundColor: "#FFF0F0",
    borderRadius: 13,
    padding: 14,
    marginBottom: 18,
  },

  classroomErrorText: {
    color: "#B83232",
    fontSize: 12,
    lineHeight: 19,
    marginBottom: 8,
  },

  classroomInlineAction: {
    alignSelf: "flex-start",
    marginTop: 10,
  },

  classroomInlineActionText: {
    color: "#7565D8",
    fontSize: 12,
    fontWeight: "800",
  },

  classroomSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },

  classroomCount: {
    color: "#7565D8",
    fontSize: 11,
    fontWeight: "700",
  },

  classroomCourseCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 17,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: "#EAE7F2",
  },

  classroomCourseTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  classroomCourseMark: {
    width: 43,
    height: 43,
    borderRadius: 12,
    backgroundColor: "#EAE5FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  classroomCourseMarkText: {
    color: "#7565D8",
    fontSize: 19,
    fontWeight: "900",
  },

  classroomCourseInfo: {
    flex: 1,
  },

  classroomCourseName: {
    color: "#202033",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
  },

  classroomCourseMeta: {
    color: "#77758A",
    fontSize: 11,
    marginTop: 2,
  },

  classroomCourseChevron: {
    color: "#7565D8",
    fontSize: 28,
    paddingLeft: 8,
  },

  classroomCourseDescription: {
    color: "#77758A",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },

  classroomCourseAction: {
    color: "#7565D8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 15,
  },

  classroomBackToCourses: {
    alignSelf: "flex-start",
    marginBottom: 18,
  },

  classroomAssignmentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 17,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: "#EAE7F2",
  },

  classroomAssignmentTitle: {
    color: "#202033",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21,
  },

  classroomAssignmentMeta: {
    color: "#9995AA",
    fontSize: 10,
    marginTop: 7,
  },

  classroomAssignmentDescription: {
    color: "#55536A",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 10,
  },

  classroomDueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F7F6FC",
    borderRadius: 10,
    padding: 11,
    marginTop: 13,
  },

  classroomDueLabel: {
    color: "#7565D8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  classroomDueValue: {
    color: "#55536A",
    fontSize: 11,
    fontWeight: "700",
  },
});

// SafeAreaProvider belongs at the application root.
export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
