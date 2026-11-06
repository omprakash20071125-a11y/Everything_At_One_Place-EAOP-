import React, { useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

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
  | "busSchedule"
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

const BUS_DAYS: { label: string; value: BusDay }[] = [
  { label: "MON", value: "MON" },
  { label: "TUE", value: "TUE" },
  { label: "WED", value: "WED" },
  { label: "THU", value: "THU" },
  { label: "FRI", value: "FRI" },
  { label: "SAT", value: "SAT" },
  { label: "SUN", value: "SUN" },
];

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
  // PostgreSQL TIME is normally returned as HH:MM:SS.
  // This also supports HH:MM.
  const [hoursPart, minutesPart] = value.split(":");
  const hours = Number(hoursPart);

  if (!Number.isFinite(hours) || !minutesPart) {
    return value;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${minutesPart.slice(0, 2)} ${period}`;
}

// ------------------------------------------------
// APP
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

  // Saved profile
  const [profile, setProfile] = useState<Profile | null>(null);

  // Bus schedule state
  const [selectedBusDay, setSelectedBusDay] = useState<BusDay>(getTodayBusDay);
  const [busTrips, setBusTrips] = useState<BusTrip[]>([]);
  const [busLoading, setBusLoading] = useState(false);
  const [busError, setBusError] = useState("");
  const [busRefreshKey, setBusRefreshKey] = useState(0);

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

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.detail || "Unable to fetch profile.");
        }

        setProfile(result);
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
    if (screen !== "busSchedule") {
      return;
    }

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
        if (mounted) {
          setBusLoading(false);
        }
      }
    }

    fetchBusSchedule();

    return () => {
      mounted = false;
    };
  }, [screen, selectedBusDay, busRefreshKey]);

  // ------------------------------------------------
  // 4. LOGIN / SIGNUP
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
  // 5. CREATE STUDENT PROFILE
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

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Unable to create profile.");
      }

      setProfile(result);
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
  // 6. LOGOUT
  // ------------------------------------------------

  async function logout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert("Logout failed", error.message);
    }
  }

  // ------------------------------------------------
  // 7. REUSABLE OPTION BUTTON
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
  // 8. LOADING SCREEN
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
  // 9. ERROR SCREEN
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
  // 10. LOGIN / SIGNUP SCREEN
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
  // 11. PROFILE ONBOARDING SCREEN
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

            {/* NAME */}
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

            {/* YEAR */}
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

            {/* BRANCH */}
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

            {/* SEMESTER */}
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

            {/* BIO */}
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

            {/* SUBMIT */}
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
  // 12. BUS SCHEDULE SCREEN
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
          {/* HEADER */}
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

          {/* DAY SELECTOR */}
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

          {/* SCHEDULE HEADING */}
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

          {/* LOADING */}
          {busLoading && (
            <View style={styles.busMessage}>
              <ActivityIndicator size="large" color="#7565D8" />
              <Text style={styles.busMessageText}>
                Loading bus schedule...
              </Text>
            </View>
          )}

          {/* ERROR */}
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

          {/* EMPTY STATE */}
          {!busLoading && !busError && busTrips.length === 0 && (
            <View style={styles.busMessage}>
              <Text style={styles.busEmptyTitle}>No buses found</Text>
              <Text style={styles.busMessageText}>
                No bus trips are available for this day.
              </Text>
            </View>
          )}

          {/* BUS TRIPS GROUPED BY BUS NUMBER */}
          {!busLoading &&
            !busError &&
            (["B1", "B2", "B3"] as const).map((busNumber) => {
              const tripsForBus = busTrips
                .filter((trip) => trip.bus_number === busNumber)
                .sort((a, b) =>
                  a.departure_time.localeCompare(b.departure_time)
                );

              if (tripsForBus.length === 0) {
                return null;
              }

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
                          <Text style={styles.busLocation}>
                            {trip.origin}
                          </Text>
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
  // 13. HOME DASHBOARD
  // ------------------------------------------------

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

        <View style={styles.featureCard}>
          <Text style={styles.featureNumber}>02</Text>
          <Text style={styles.featureTitle}>Campus Activities</Text>
          <Text style={styles.featureDescription}>
            Keep track of your college life in one place.
          </Text>
          <Text style={styles.comingSoon}>COMING NEXT</Text>
        </View>

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

  // Bus schedule styles
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
});


// Keep SafeAreaProvider at the application root so every screen can use
// SafeAreaView from react-native-safe-area-context.
export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
