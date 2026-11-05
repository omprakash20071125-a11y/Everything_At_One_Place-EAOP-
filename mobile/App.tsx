
import React, { useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { Session } from "@supabase/supabase-js";

import { supabase } from "./src/lib/supabase";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [mode, setMode] = useState<"login" | "register">("login");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [backendResponse, setBackendResponse] = useState("");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        Alert.alert("Session error", error.message);
      }

      setSession(data.session);
      setCheckingSession(false);
    });

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
      Alert.alert("Invalid password", "Use at least 8 characters.");
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
            "Check your inbox, verify your account, and then log in."
          );
        } else {
          Alert.alert("Success", "Your EAOP account has been created.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) throw error;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong.";

      Alert.alert("Authentication failed", message);
    } finally {
      setLoading(false);
    }
  }

  async function testBackend() {
    if (!session?.access_token || !API_URL) {
      Alert.alert("Configuration error", "Session or API URL is missing.");
      return;
    }

    setLoading(true);
    setBackendResponse("");

    try {
      const response = await fetch(`${API_URL}/api/v1/me`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Backend request failed.");
      }

      setBackendResponse(JSON.stringify(result, null, 2));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connection failed.";

      Alert.alert("Backend error", message);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert("Logout failed", error.message);
    }

    setBackendResponse("");
  }

  if (checkingSession) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#7565D8" />
        <Text style={styles.subtitle}>Loading EAOP...</Text>
      </SafeAreaView>
    );
  }

  if (session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.logo}>EAOP.</Text>
          <Text style={styles.title}>Welcome aboard!</Text>
          <Text style={styles.subtitle}>
            {session.user.email}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Authentication successful</Text>
          <Text style={styles.subtitle}>
            Your Supabase session is active.
          </Text>

          <Pressable
            style={styles.button}
            onPress={testBackend}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Connecting..." : "Test FastAPI Connection"}
            </Text>
          </Pressable>

          {backendResponse ? (
            <Text style={styles.response}>{backendResponse}</Text>
          ) : null}
        </View>

        <Pressable style={styles.secondaryButton} onPress={logout}>
          <Text style={styles.secondaryText}>Log out</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.logo}>EAOP.</Text>

          <Text style={styles.title}>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </Text>

          <Text style={styles.subtitle}>
            Everything at one place. Your college life, simplified.
          </Text>

          {mode === "register" && (
            <TextInput
              style={styles.input}
              placeholder="Full name"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          <Pressable
            style={[styles.button, loading && styles.disabled]}
            onPress={handleAuthentication}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Log in"
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
                ? "New here? Create an account"
                : "Already registered? Log in"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F6FC",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 28,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    padding: 28,
    paddingTop: 60,
  },
  logo: {
    fontSize: 30,
    fontWeight: "800",
    color: "#7565D8",
    letterSpacing: 2,
    marginBottom: 30,
  },
  title: {
    fontSize: 29,
    fontWeight: "700",
    color: "#202033",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: "#77758A",
    marginBottom: 30,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E2F0",
    borderRadius: 13,
    padding: 16,
    fontSize: 15,
    marginBottom: 15,
  },
  button: {
    backgroundColor: "#7565D8",
    padding: 17,
    borderRadius: 13,
    alignItems: "center",
    marginTop: 12,
  },
  disabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  modeButton: {
    alignItems: "center",
    marginTop: 25,
  },
  modeText: {
    color: "#7565D8",
    fontWeight: "600",
  },
  card: {
    marginHorizontal: 24,
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E2F0",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
    color: "#202033",
  },
  response: {
    fontSize: 12,
    marginTop: 15,
    color: "#333333",
  },
  secondaryButton: {
    margin: 24,
    alignItems: "center",
    padding: 15,
  },
  secondaryText: {
    color: "#7565D8",
    fontWeight: "700",
  },
});
