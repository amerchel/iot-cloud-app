const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;

app.get("/", (req, res) => {
    const temperature = (20 + Math.random() * 8).toFixed(1);
    const humidity = (40 + Math.random() * 30).toFixed(1);
    const date = new Date().toLocaleString("pl-PL", {
        timeZone: "Europe/Warsaw"
    });

    res.send(`
    <html>
      <head>
        <title>IoT Dashboard</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #0f172a;
            color: white;
            text-align: center;
            padding-top: 80px;
          }
          .card {
            background: #1e293b;
            padding: 30px;
            border-radius: 16px;
            display: inline-block;
            min-width: 350px;
          }
          h1 {
            color: #38bdf8;
          }
          .value {
            font-size: 32px;
            margin: 15px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>IoT Temperature Monitor - nowy webhook </h1>
          <p>Symulowany dashboard urządzenia IoT</p>
          <div class="value">🌡️ Temperatura: ${temperature} °C</div>
          <div class="value">💧 Wilgotność: ${humidity} %</div>
          <p>Ostatnia aktualizacja: ${date}</p>
        </div>
      </body>
    </html>
  `);
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "iot-cloud-merchel",
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Aplikacja działa na porcie ${PORT}`);
});