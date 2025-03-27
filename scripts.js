document.getElementById("diagnosis-form").addEventListener("submit", async function (event) {
    event.preventDefault();

    const symptoms = document.getElementById("symptoms").value;
    const resultElement = document.getElementById("result");

    resultElement.textContent = "⏳ Getting Diagnosis...";

    try {
        const response = await fetch("http://localhost:5000/predict", {  
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symptoms })
        });

        const data = await response.json();

        if (response.ok) {
            resultElement.textContent = `✅ Diagnosis: ${data.prediction}`;
        } else {
            resultElement.textContent = `❌ Error: ${data.message}`;
        }
    } catch (error) {
        console.error("Prediction error:", error);
        resultElement.textContent = "❌ Failed to get diagnosis. Try again.";
    }
});
