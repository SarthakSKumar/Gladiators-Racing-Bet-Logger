function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const id = data.id;
    const sender = data.sender;
    const message = data.message;
    const groupName = data.groupName;
    const timestamp = data.timestamp;
    const raceNumber = data.raceNumber;

    const indianRacingSpreadsheet =
      "1VBCoHC4sFKo9-z-UFYBZyR5Ffb34mkOb_PANtgh5224";
    const internationalRacingSpreadsheet =
      "17SV8q-OUgKocFJ_Vi6VEoWaU-0kGarRJiOJz16jiC2o";

    let spreadsheetId;
    if (groupName === "Gladiators Indian Racing 🏇") {
      spreadsheetId = indianRacingSpreadsheet;
    } else if (groupName === "Gladiators International Racing 🏇") {
      spreadsheetId = internationalRacingSpreadsheet;
    } else {
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "error",
          message: `Unrecognized group name: '${groupName}'`,
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName("1");
    if (!sheet) {
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "error",
          message: `Sheet '${raceNumber}' not found!`,
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const targetRow = id + 2;
    const sNo = id;
    const istTime = Utilities.formatDate(
      new Date(timestamp),
      "Asia/Kolkata",
      "dd/MM/yyyy HH:mm"
    );

    // ---------- GEMINI API PARSING ----------
    const apiKey = "AIzaSyAzOfa0MV8ZslrQsmpnLhcNUG4hW47_bns";
    const apiUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
      apiKey;

    const prompt = `
You will be given a text message sent by a user in a horse betting group to register a bet for a horse race.

Your task is to extract the following into a JSON object:
- hNo: horse number (integer)
- win: win amount (integer)
- place: place amount (integer)

Rules:
- Message may include variations of "win": W, Win, Wn, Ww, Won, WIIN (case in-sensitive)
- Message may include variations of "place": P, Plase, Pl, Ple, Plz, Pls, Pla, Ps, Please, pal (case in-sensitive)
- Message may contain spacing between elements or none at all (e.g., "2 win 200", "6w1200p300", "2p100", "6w100", "2p1kw3k")
- Message need not contain both place and win. It can be only for place, or only for win, or both. If only win is present in the message, then the amount for place would be 0. Similarly for place as well. 
- If a message contains both win and place bets, extract both
- Always respond in a strict JSON object format like:
  { "hNo": number, "win": number, "place": number }

Examples:
- "2w200" → { "hNo": 2, "win": 200, "place": 0 }
- "3p1kw5k" → { "hNo": 3, "win": 5000, "place": 1000 }
- "3p2k" → { "hNo": 3, "win": 0, "place": 2000 }
- "5place500" → { "hNo": 5, "win": 0, "place": 500 }
- "6w1200p300" → { "hNo": 6, "win": 1200, "place": 300 }
- "2 win 200 place 500" → { "hNo": 2, "win": 200, "place": 500 }
- "random garbage" → { "error": "Could not parse message" }

If the message is unclear, invalid, or unparseable, then return:
  { "error": "Could not parse message" }

Now extract from this message:
"${message}"
`;

    const geminiPayload = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    };

    const options = {
      method: "POST",
      contentType: "application/json",
      payload: JSON.stringify(geminiPayload),
      muteHttpExceptions: true,
    };

    let hNo = "";
    let win = 0;
    let place = 0;
    let geminiError = false;

    try {
      const response = UrlFetchApp.fetch(apiUrl, options);
      const responseCode = response.getResponseCode();

      if (responseCode === 200) {
        const responseData = JSON.parse(response.getContentText());
        let rawText = responseData.candidates[0].content.parts[0].text.trim();

        // Remove ```json ... ``` if present
        rawText = rawText
          .replace(/```(?:json)?/g, "")
          .replace(/```/g, "")
          .trim();

        let parsed = {};
        try {
          parsed = JSON.parse(rawText);
        } catch (jsonErr) {
          geminiError = true;
        }

        if (parsed.error) {
          geminiError = true;
        } else {
          hNo = parsed.hNo || "";
          win = parsed.win || 0;
          place = parsed.place || 0;
        }
      } else {
        geminiError = true;
      }
    } catch (error) {
      geminiError = true;
    }

    // ---------- WRITE TO SHEET ----------
    sheet
      .getRange(targetRow, 1, 1, 8)
      .setValues([
        [
          sNo,
          istTime,
          sender,
          message,
          `=LEFT(C${targetRow}, 2)`,
          hNo,
          win,
          place,
        ],
      ]);

    if (geminiError) {
      sheet.getRange(targetRow, 4).setBackground("#FFCCCC"); // Highlight column D if error
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        status: "success",
        message: `Bet logged at row ${targetRow} (ID: ${id}), Horse: ${hNo}, Win: ${win}, Place: ${place}`,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: "error",
        message: error.message,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
