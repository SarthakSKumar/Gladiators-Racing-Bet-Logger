function resetSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const templateSheetName = "Template Sheet ⚠️🚫 (DND)";
  const debugSheetName = "Debug";
  const sheetNamesToReset = ["RACE 1", "RACE 2", "RACE 3", "RACE 4", "RACE 5", "RACE 6", "RACE 7", "RACE 8", "RACE 9"];

  sheetNamesToReset.forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (sheet) {
      ss.deleteSheet(sheet);
    }
  });

  const templateSheet = ss.getSheetByName(templateSheetName);
  if (!templateSheet) {
    throw new Error("Template sheet not found!");
  }
  sheetNamesToReset.forEach(name => {
    const newSheet = templateSheet.copyTo(ss);
    newSheet.setName(name);
    ss.setActiveSheet(newSheet);
  });

  const debugSheet = ss.getSheetByName(debugSheetName);
  if (debugSheet) {
    debugSheet.clearContents();
  } else {
    throw new Error("Debug sheet not found!");
  }
}

function logDebug(dataObject, rawResponse, errorNote, spreadsheetId) {
  try {
    const debugSheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName("Debug");
    if (!debugSheet) {
      throw new Error("Debug sheet not found");
    }
    debugSheet.appendRow([
      new Date(),
      JSON.stringify(dataObject),
      rawResponse || "",
      errorNote || ""
    ]);
  } catch (err) {
    Logger.log("Failed to log debug info: " + err.message);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const id = data.id;
    const sender = data.sender;
    const message = data.message;
    const groupName = data.groupName;
    const timestamp = data.timestamp;
    const raceNumber = data.raceNumber;

    const indianRacingSpreadsheet = "1VBCoHC4sFKo9-z-UFYBZyR5Ffb34mkOb_PANtgh5224";
    const internationalRacingSpreadsheet = "17SV8q-OUgKocFJ_Vi6VEoWaU-0kGarRJiOJz16jiC2o";

    let spreadsheetId;
    if (groupName === "Gladiators Indian Racing 🏇") {
      spreadsheetId = indianRacingSpreadsheet;
    } else if (groupName === "Gladiators International Racing 🏇") {
      spreadsheetId = internationalRacingSpreadsheet;
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: `Unrecognized group name: '${groupName}'`,
      })).setMimeType(ContentService.MimeType.JSON);
    }

    let ss = SpreadsheetApp.openById(spreadsheetId);
    let sheet = ss.getSheetByName(`RACE ${raceNumber}`);

    if (!sheet) {
      let template = ss.getSheetByName("Template Sheet ⚠️🚫 (DND)");
      if (!template) {
        throw new Error("Template Sheet not found!");
      }
      sheet = template.copyTo(ss);
      sheet.setName(`RACE ${raceNumber}`);
      ss.setActiveSheet(sheet);
    }

    const targetRow = id + 2;
    const sNo = id;
    const istTime = Utilities.formatDate(new Date(timestamp), "Asia/Kolkata", "dd/MM/yyyy HH:mm");

    const apiKey = "";
    const apiUrl = "https://api.openai.com/v1/responses";

    const prompt = `
You will be given a text message sent by a user in a horse betting group to register a bet for a horse race.
Your task is to extract the following into a JSON object:
- hNo: horse number (integer)
- win: win amount (integer)
- place: place amount (integer)

Rules:
- Message may include variations of "win": W, Win, Wn, Ww, Won, WIIN (case in-sensitive)
- Message may include variations of "place": P, Plase, Pl, Ple, Plz, Pls, Pla, Ps, Please, pal (case in-sensitive)
- Message may include variations of "each way": ew, each way, eachw, eway (case in-sensitive)
- Message may contain various spacing between elements or none at all (e.g., "2 win 200", "6w1200p 300", "2 p100", "6w100", "2p 1k w 3k", "10ew1000)
- "each way" means the bet is for both win and place with the same amount.
- Message need not contain both place and win. It can be only for place or only for win, or both. If it's each way, then it's same as both place and win. (e.g., 2ew200 is same as 2p200w200)
- If only win is present in the message, then the amount for place would be 0. Similarly for place as well.
- If the message is unclear, invalid, or unparseable, then return: { "error": "Could not parse message" }
- Always respond in a strict JSON object format like:
  { "hNo": number, "win": number, "place": number }

Examples:
- "2w200" → { "hNo": 2, "win": 200, "place": 0 }
- "3p1kw5k" → { "hNo": 3, "win": 5000, "place": 1000 }
- "3p2k" → { "hNo": 3, "win": 0, "place": 2000 }
- "2 place. 8000. K B" → { "hNo": 2, "win": 0, "place": 8000 }
- "5place500" → { "hNo": 5, "win": 0, "place": 500 }
- "1.W.500" → { "hNo": 1, "win":500, "place": 0 }
- "4ew100" → { "hNo": 4, "win": 100, "place": 100 }
- "1win. 15k" → { "hNo": 1, "win":15000, "place": 0 }
- "2 win.   3000. .k" -> { "hNo": 2, "win":00, "place": 0 }
- "9 each way 3k" → { "hNo": 9, "win": 3000, "place": 3000 }
- "6w1200p300" → { "hNo": 6, "win": 1200, "place": 300 }
- "2 win 200 place 500" → { "hNo": 2, "win": 200, "place": 500 }
- "random garbage" → { "error": "Could not parse message" }

If the message is unclear, invalid, or unparseable, then only return: { "error": "Could not parse message" }
Respond only with valid JSON. Do not include explanations or any extra text.
Now extract from this message: "${message}"`;

    const payload = {
      model: "gpt-5-nano",
      input: prompt,
      text: {
        format: { type: "text" },
        verbosity: "low"
      },
      reasoning: {
        effort: "medium"
      },
      tools: [],
      store: false
    };

    const options = {
      method: "POST",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + apiKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    let hNo = "";
    let win = 0;
    let place = 0;
    let apiError = false;
    let rawText = "";
    let parsed = {};

    try {
      const response = UrlFetchApp.fetch(apiUrl, options);
      const responseCode = response.getResponseCode();

      if (responseCode === 200) {
        const responseData = JSON.parse(response.getContentText());
        rawText = (responseData.output_text || "").trim();

        rawText = rawText.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();

        try {
          parsed = JSON.parse(rawText);
        } catch (jsonErr) {
          apiError = true;
          logDebug(data, rawText, "JSON parse error", spreadsheetId);
        }

        if (parsed.error) {
          apiError = true;
          logDebug(data, rawText, `Model returned error key`, spreadsheetId);
        } else {
          hNo = parsed.hNo || "";
          win = parsed.win || 0;
          place = parsed.place || 0;
        }
      } else {
        apiError = true;
        logDebug(data, "", `HTTP status ${responseCode} ${response}`, spreadsheetId);
      }

    } catch (error) {
      apiError = true;
      logDebug(data, "", `Exception: ${error.message}`, spreadsheetId);
    }

    sheet.getRange(targetRow, 1, 1, 8).setValues([
      [sNo, istTime, sender, message, `=LEFT(C${targetRow}, 2)`, hNo, win, place]
    ]);

    if (apiError) {
      sheet.getRange(targetRow, 4).setBackground("#FFCCCC"); // Highlight column D if error
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: `Bet logged at row ${targetRow} (ID: ${id}), Horse: ${hNo}, Win: ${win}, Place: ${place}`,
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.message,
    })).setMimeType(ContentService.MimeType.JSON);
  }
}