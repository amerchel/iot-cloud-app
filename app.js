const express = require("express");
const sql = require("mssql");

const app = express();
const PORT = process.env.PORT || 8080;

const dbConfig = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
};

let poolPromise;

function getPool() {
    if (!poolPromise) {
        poolPromise = new sql.ConnectionPool(dbConfig)
            .connect()
            .then((pool) => {
                console.log("Połączono z Azure SQL Database");
                return pool;
            })
            .catch((error) => {
                poolPromise = null;
                throw error;
            });
    }

    return poolPromise;
}

async function getTelemetryFromDatabase() {
    if (!dbConfig.server || !dbConfig.database || !dbConfig.user || !dbConfig.password) {
        throw new Error("Database environment variables are missing");
    }

    const pool = await getPool();

    const result = await pool.request().query(`
        SELECT TOP 1
            temperature,
            humidity,
            battery,
            signal_strength,
            measured_at
        FROM telemetry
        ORDER BY measured_at DESC
    `);

    if (!result.recordset.length) {
        throw new Error("No telemetry data found");
    }

    return result.recordset[0];
}

function getFallbackTelemetry() {
    return {
        temperature: (20 + Math.random() * 8).toFixed(1),
        humidity: (40 + Math.random() * 30).toFixed(1),
        battery: (70 + Math.random() * 30).toFixed(0),
        signal_strength: (80 + Math.random() * 20).toFixed(0),
        measured_at: new Date()
    };
}

app.get("/", async (req, res) => {
    let telemetry;
    let source = "Azure SQL Database";

    try {
        telemetry = await getTelemetryFromDatabase();
    } catch (error) {
        telemetry = getFallbackTelemetry();
        source = "Fallback telemetry";
        console.error("SQL error:", error.message);
    }

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
            background: linear-gradient(180deg, #0f172a, #020617);
            color: white;
            margin: 0;
            padding: 60px 20px;
          }

          .container {
            max-width: 900px;
            margin: auto;
            text-align: center;
          }

          h1 {
            color: #38bdf8;
            margin-bottom: 5px;
          }

          .subtitle {
            color: #94a3b8;
            margin-bottom: 30px;
          }

          .status {
            display: inline-block;
            background: rgba(34, 197, 94, 0.15);
            color: #22c55e;
            padding: 8px 14px;
            border-radius: 999px;
            margin-bottom: 25px;
            font-weight: bold;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 20px;
          }

          .card {
            background: #1e293b;
            padding: 25px;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          }

          .label {
            color: #94a3b8;
            font-size: 14px;
            margin-bottom: 10px;
          }

          .value {
            font-size: 32px;
            font-weight: bold;
          }

          .source {
            margin-top: 18px;
            color: #38bdf8;
            font-size: 14px;
          }

          .footer {
            margin-top: 30px;
            color: #94a3b8;
            font-size: 12px;
          }

          @media (max-width: 600px) {
            .grid {
              grid-template-columns: 1fr;
            }
          }
        </style>
      </head>

      <body>
        <div class="container">
          <h1>IoT Temperature Monitor</h1>

          <div class="subtitle">
            Azure App Service • Docker • ACR • GitHub Actions • Webhook CD • Azure SQL
          </div>

          <div class="status">
            ● Device ONLINE
          </div>

          <div class="grid">
            <div class="card">
              <div class="label">🌡️ Temperatura</div>
              <div class="value">${Number(telemetry.temperature).toFixed(1)} °C</div>
            </div>

            <div class="card">
              <div class="label">💧 Wilgotność</div>
              <div class="value">${Number(telemetry.humidity).toFixed(1)} %</div>
            </div>

            <div class="card">
              <div class="label">🔋 Bateria</div>
              <div class="value">${Number(telemetry.battery).toFixed(0)}%</div>
            </div>

            <div class="card">
              <div class="label">📶 Sygnał</div>
              <div class="value">${Number(telemetry.signal_strength).toFixed(0)}%</div>
            </div>
          </div>

          <div class="source">
            Źródło danych: ${source}
          </div>

          <div class="footer">
            Ostatnia aktualizacja dashboardu: ${date}
          </div>
        </div>
      </body>
    </html>
  `);
});

app.get("/api/generate", async (req, res) => {
    try {
        const pool = await getPool();

        const temperature = (20 + Math.random() * 8).toFixed(1);
        const humidity = (40 + Math.random() * 30).toFixed(1);
        const battery = Math.floor(70 + Math.random() * 30);
        const signal = Math.floor(80 + Math.random() * 20);

        await pool.request()
            .input("temperature", sql.Decimal(5, 2), temperature)
            .input("humidity", sql.Decimal(5, 2), humidity)
            .input("battery", sql.Int, battery)
            .input("signal_strength", sql.Int, signal)
            .query(`
                INSERT INTO telemetry
                (temperature, humidity, battery, signal_strength)
                VALUES
                (@temperature, @humidity, @battery, @signal_strength)
            `);

        res.json({
            status: "created",
            message: "New telemetry measurement generated",
            telemetry: {
                temperature,
                humidity,
                battery,
                signal_strength: signal
            }
        });
    } catch (error) {
        res.status(500).json({
            status: "error",
            message: error.message
        });
    }
});

app.get("/health", async (req, res) => {
    let database = "connected";

    try {
        await getTelemetryFromDatabase();
    } catch {
        database = "unavailable";
    }

    res.json({
        status: "ok",
        service: "iot-cloud-merchel",
        environment: "Azure App Service",
        container: "Docker",
        registry: "Azure Container Registry",
        database,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Aplikacja działa na porcie ${PORT}`);
});