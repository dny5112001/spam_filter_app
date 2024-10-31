import {
  FlatList,
  NativeModules,
  PermissionsAndroid,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import React, { useEffect, useState } from "react";
import SmsAndroid from "react-native-get-sms-android"; // Ensure this is the correct import

const { Sms } = NativeModules;

const HomeScreen = () => {
  const [newMessage, setNewMessage] = useState("");
  const [recipient, setRecipient] = useState("");
  const [sentMessages, setSentMessages] = useState([]);
  const [loading, setLoading] = useState(false); // Loading state for sending messages
  const [filter, setFilter] = useState("sent");
  const [messages, setMessages] = useState([]);
  const [spamPredictions, setSpamPredictions] = useState({});
  const [lastMessageId, setLastMessageId] = useState(null); // Track the last fetched message ID

  async function requestSMSPermissions() {
    const sendPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.SEND_SMS,
      {
        title: "SMS Permission",
        message: "This app needs access to send SMS messages.",
        buttonNeutral: "Ask Me Later",
        buttonNegative: "Cancel",
        buttonPositive: "OK",
      }
    );

    const readPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      {
        title: "Read SMS Permission",
        message: "This app needs access to read your SMS messages.",
        buttonNeutral: "Ask Me Later",
        buttonNegative: "Cancel",
        buttonPositive: "OK",
      }
    );

    return (
      sendPermission === PermissionsAndroid.RESULTS.GRANTED &&
      readPermission === PermissionsAndroid.RESULTS.GRANTED
    );
  }
  const sendSMS = async () => {
    if (!recipient || !newMessage) {
      alert("Please enter both recipient and message");
      return;
    }

    const hasPermission = await requestSMSPermissions(); // Use the new function
    if (!hasPermission) {
      console.log("SMS permission denied");
      return;
    }

    setLoading(true);
    SmsAndroid.autoSend(
      recipient,
      newMessage,
      (fail) => {
        console.log("Failed to send SMS:", fail);
        alert("Failed to send SMS. Please try again.");
        setLoading(false);
      },
      (success) => {
        console.log("SMS sent successfully");
        alert("SMS sent successfully!");
        setNewMessage("");
        setRecipient("");
        setLoading(false);
        fetchSentMessages();
      }
    );
  };

  const fetchSentMessages = () => {
    Sms.listSentMessages(
      (error) => console.log("Failed to fetch sent SMS:", error),
      (count, smsList) => {
        const messages = JSON.parse(smsList);
        setSentMessages(messages); // Update state with fetched messages
      }
    );
  };

  const callPredictAPI = async (text) => {
    try {
      const response = await fetch("http://192.168.0.106:5000/predict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const data = await response.json();
      return data.prediction;
    } catch (error) {
      console.error("Error calling the API:", error);
    }
  };
  useEffect(() => {
    fetchSentMessages(); // Fetch messages on mount

    async function fetchSMS() {
      const hasPermission = await requestSMSPermissions();
      if (!hasPermission) {
        console.log("SMS permission denied");
        return;
      }

      const filter = {
        box: "inbox",
        maxCount: 15,
      };

      if (SmsAndroid) {
        SmsAndroid.list(
          JSON.stringify(filter),
          (fail) => {
            console.log("Failed to fetch SMS:", fail);
          },
          async (count, smsList) => {
            const messages = JSON.parse(smsList);
            const newMessages = messages.filter(
              (msg) => msg._id > (lastMessageId || 0)
            );

            if (newMessages.length > 0) {
              setMessages((prevMessages) => [...newMessages, ...prevMessages]);
              setLastMessageId(newMessages[0]._id); // Update last message ID to the latest one

              // Only call the API for new messages
              const predictions = await Promise.all(
                newMessages.map(async (message) => {
                  const prediction = await callPredictAPI(message.body);
                  return { id: message._id, prediction };
                })
              );

              // Update spam predictions based on API results
              predictions.forEach(({ id, prediction }) => {
                setSpamPredictions((prev) => ({
                  ...prev,
                  [id]: prediction,
                }));
              });
            }
          }
        );
      } else {
        console.log("SmsAndroid is null");
      }
    }

    fetchSMS(); // Initial fetch for SMS

    const intervalId = setInterval(fetchSMS, 10000); // Fetch every 10 seconds

    return () => clearInterval(intervalId); // Cleanup interval on unmount
  }, []);

  const renderItem = ({ item }) => (
    <View style={styles.messageContainer1}>
      <Text style={styles.sender}>Reciever: {item.address}</Text>
      <Text style={styles.body}>Message: {item.body}</Text>
      <Text style={styles.date}>
        Date: {new Date(item.date).toLocaleString()}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Spam Filter</Text>
      <TextInput
        placeholder="Enter receiver's mobile number"
        placeholderTextColor="#fff"
        cursorColor={"#fff"}
        value={recipient}
        onChangeText={setRecipient}
        style={styles.input}
      />
      <TextInput
        placeholder="Enter the message"
        placeholderTextColor="#fff"
        cursorColor={"#fff"}
        multiline={true}
        value={newMessage}
        onChangeText={setNewMessage}
        style={styles.input}
      />
      <TouchableOpacity
        style={styles.button}
        onPress={sendSMS}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? "Sending..." : "Send"}</Text>
      </TouchableOpacity>
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.sentButton}
          onPress={() => {
            setFilter("sent");
          }}
        >
          <Text style={styles.sentButtonText}>Sent</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.receivedButton}
          onPress={() => {
            setFilter("Received");
          }}
        >
          <Text style={styles.receivedButtonText}>Received</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.sentMessagesHeader}>
        Message {filter == "sent" ? <Text>Sent</Text> : <Text>Received</Text>}
      </Text>
      <View style={styles.messagesListContainer}>
        {filter == "sent" ? (
          <FlatList
            data={sentMessages}
            keyExtractor={(item) => item._id.toString()}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {messages.map((message, index) => (
              <View key={index} style={styles.messageContainer}>
                <View style={styles.messageContainer1}>
                  <Text style={styles.sender}>From: {message.address}</Text>
                  <Text style={styles.body}>Message: {message.body}</Text>
                  <Text style={styles.prediction}>
                    Prediction:{" "}
                    {spamPredictions[message._id] === undefined ? (
                      <Text>Loading...</Text>
                    ) : spamPredictions[message._id] == "ham" ? (
                      <Text style={{ color: "green" }}>Not Spam</Text>
                    ) : (
                      <Text style={{ color: "red" }}>Spam</Text>
                    )}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: "#303032",
    paddingBottom: 20,
  },
  header: {
    marginBottom: 20,
    color: "#fff",
    fontSize: 18,
  },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    height: 50,
    borderRadius: 10,
    paddingLeft: 20,
    color: "#fff",
    marginBottom: 20,
  },
  button: {
    height: 50,
    backgroundColor: "#C5753A",
    marginTop: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 30,
  },
  sentButton: {
    height: 50,
    borderWidth: 3,
    borderColor: "#C5753A",
    marginTop: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    width: "48%",
  },
  sentButtonText: {
    color: "#C5753A",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },
  receivedButton: {
    height: 50,
    borderWidth: 3,
    borderColor: "#C5753A",
    marginTop: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    width: "48%",
  },
  receivedButtonText: {
    color: "#C5753A",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },
  sentMessagesHeader: {
    marginTop: 20,
    color: "#fff",
    fontSize: 18,
  },
  messagesListContainer: {
    flex: 1,
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 10,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    padding: 10,
  },
  messageContainer1: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: 5,
  },
  sender: {
    fontWeight: "bold",
  },
  body: {
    marginTop: 5,
  },
  date: {
    marginTop: 5,
    color: "grey",
    fontSize: 12,
  },
  prediction: {
    marginTop: 5,
    fontWeight: "bold",
  },
});
