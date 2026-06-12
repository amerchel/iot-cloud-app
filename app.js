const express = require("express");
const sql = require("mssql");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static("public"));

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

function renderDashboard(data) {
    const htmlPath = path.join(__dirname, "views", "dashboard.html");

    let html = fs.readFileSync(htmlPath, "utf8");

    return html
        .replaceAll("{{temperature}}", Number(data.telemetry.temperature).toFixed(1))
        .replaceAll("{{humidity}}", Number(data.telemetry.humidity).toFixed(1))
        .replaceAll("{{battery}}", Number(data.telemetry.battery).toFixed(0))
        .replaceAll("{{signal}}", Number(data.telemetry.signal_strength).toFixed(0))
        .replaceAll("{{source}}", data.source)
        .replaceAll("{{date}}", data.date);
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

    const html = renderDashboard({
        telemetry,
        source,
        date
    });

    res.send(html);
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