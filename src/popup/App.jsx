import React from "react";

function App() {
  return (
    <div
      style={{
        padding: "24px",
        textAlign: "center",
        background: "#0f0f0f",
        color: "#e0e0e0",
        minHeight: "500px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <h1 style={{ fontSize: "28px", margin: 0 }}>🧠 BrainRot Score</h1>
      <p style={{ color: "#888", marginTop: "8px" }}>
        Your Weekly Doom Report
      </p>
    </div>
  );
}

export default App;
