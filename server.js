const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

function now() {
  const d = new Date();
  return `${d.toISOString()} (${d.getTime()})`;
}

function parseCurl(curl) {
  // Remove line breaks and backslashes
  curl = curl.replace(/\\\n/g, " ").replace(/\n/g, " ");

  const result = {
    method: "GET",
    url: "",
    headers: {},
    data: null,
  };

  // --------------------
  // METHOD
  // --------------------
  const methodMatch = curl.match(/-X\s+(\w+)/i);
  if (methodMatch) {
    result.method = methodMatch[1].toUpperCase();
  }

  if (!methodMatch && curl.includes("--data")) {
    result.method = "POST";
  }

  // --------------------
  // ✅ FIXED URL PARSER
  // --------------------
  const urlMatch = curl.match(/https?:\/\/[^\s"']+/i);
  if (urlMatch) {
    result.url = urlMatch[0];
  }

  // --------------------
  // HEADERS
  // --------------------
  const headerRegex = /--header\s+["']([^"']+)["']|-H\s+["']([^"']+)["']/gi;
  let headerMatch;

  while ((headerMatch = headerRegex.exec(curl)) !== null) {
    const headerLine = headerMatch[1] || headerMatch[2];
    const parts = headerLine.split(":");
    const key = parts.shift().trim();
    const value = parts.join(":").trim();
    result.headers[key] = value;
  }

  // --------------------
  // BODY
  // --------------------
  const dataRegex = /--data(?:-raw|-binary)?\s+(['"])(.*?)\1/is;
  const dataMatch = curl.match(dataRegex);

  if (dataMatch) {
    const rawData = dataMatch[2].trim();
    try {
      result.data = JSON.parse(rawData);
    } catch {
      result.data = rawData;
    }
  }

  return result;
}

app.post("/run", async (req, res) => {
  const { curl, totalRequests } = req.body;

  if (!curl || !totalRequests) {
    return res.status(400).json({ error: "Missing input" });
  }

  const { method, url, headers, data } = parseCurl(curl);

  // ✅ Safety check
  if (!url) {
    return res.status(400).json({ error: "Invalid curl: URL not found" });
  }

  const logs = [];

  async function sendRequest(index) {
    const log = [];
    log.push(`REQUEST #${index + 1}`);
    log.push(`REQUEST_TIME: ${now()}`);
    log.push(`URL: ${url}`);
    log.push(`HEADERS: ${JSON.stringify(headers)}`);
    log.push(`BODY: ${JSON.stringify(data)}`);

    try {
      const response = await axios({
        method,
        url,
        headers,
        data,
      });

      log.push(`RESPONSE_TIME: ${now()}`);
      log.push(`STATUS: ${response.status}`);
      log.push(`RESPONSE: ${JSON.stringify(response.data)}`);
    } catch (err) {
      log.push(`RESPONSE_TIME: ${now()}`);
      if (err.response) {
        log.push(`STATUS: ${err.response.status}`);
        log.push(`RESPONSE: ${JSON.stringify(err.response.data)}`);
      } else {
        log.push(`ERROR: ${err.message}`);
      }
    }

    log.push("----------------------------------\n");

    logs.push({ index, content: log.join("\n") });
  }

  const promises = [];
  for (let i = 0; i < totalRequests; i++) {
    promises.push(sendRequest(i));
  }

  await Promise.all(promises);

  logs.sort((a, b) => a.index - b.index);

  const finalLog = logs.map((l) => l.content).join("");

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", "attachment; filename=api_logs.txt");
  res.send(finalLog);
});

app.listen(3000, () => {
  console.log("🔥 Server running at http://localhost:3000");
});
