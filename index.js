const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { PDFDocument } = require("pdf-lib");

const { Readable } = require("stream");
const cloudinary = require("cloudinary").v2;

const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

app.use(bodyParser.json());
app.use(express.json());

app.use(express.static("./public"));

cloudinary.config({
    cloud_name: "dsfr7nm3a",
    api_key: "914261393664548",
    api_secret: "7uckXI5naaQOjW8xnQ_G34YrRB0",
});

const AIRTABLE_API_KEY =
    "patnIFlyamWZtgthM.886ac387e5e38b76b059aa8c468abb0c7e7b3959917c7c993c619ce92c918057";

async function fetchRecord(tableId, recordId, AIRTABLE_BASE_ID) {
    try {
        const response = await axios.get(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}/${recordId}`,
            {
                headers: {
                    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                },
            }
        );
        return response.data;
    } catch (error) {
        // handleError(error);
        console.log(error);

        throw error;
    }
}

// Function to fetch a specific payload using the timestamp
async function fetchSpecificPayload(baseId, webhookId, timestamp) {
    try {
        const response = await axios.get(
            `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`,
            {
                headers: {
                    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                },
            }
        );

        // Convert webhook timestamp to Date for comparison
        const webhookTime = new Date(timestamp);
        console.log("Looking for webhook timestamp:", webhookTime.toISOString());

        // Sort payloads by timestamp in descending order (newest first)
        const sortedPayloads = response.data.payloads.sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        // Find the first payload that's within 1 second before the webhook timestamp
        const matchingPayload = sortedPayloads.find((payload) => {
            const payloadTime = new Date(payload.timestamp);
            const timeDiff = webhookTime - payloadTime; // positive if webhook is after payload
            console.log(
                `Comparing with payload timestamp: ${payload.timestamp}, diff: ${timeDiff}ms`
            );
            return timeDiff >= 0 && timeDiff <= 1000;
        });

        if (matchingPayload) {
            console.log(
                "Found matching payload with timestamp:",
                matchingPayload.timestamp
            );
            return matchingPayload;
        }

        console.log("No payload found matching webhook timestamp");
        return null;
    } catch (error) {
        // handleError(error);
        console.log(error);
        throw error;
    }
}

async function processWebhook(req, res) {
    console.log("Webhook received:", req.body);

    const baseId = req.body.base.id;
    const webhookId = req.body.webhook.id;
    const timestamp = req.body.timestamp;
    const targetFieldId = "fldEpaZERjNqdVqIA";
    let baseName;
    let recordDetails;
    try {
        const payload = await fetchSpecificPayload(baseId, webhookId, timestamp);
        if (!payload) {
            console.log("No matching payload found for timestamp:", timestamp);
            return res.sendStatus(200);
        }

        const changedTables = payload.changedTablesById;
        if (!changedTables) {
            console.log("No changed tables in payload");
            return res.sendStatus(200);
        }

        const tableChanges = changedTables["tblgMDhb1xvmg72ha"];
        if (!tableChanges) {
            console.log("No changes in target table");
            return res.sendStatus(200);
        }

        const changedRecords = tableChanges.changedRecordsById;
        if (!changedRecords) {
            console.log("No changed records");
            return res.sendStatus(200);
        }

        for (const recordId in changedRecords) {
            const recordChanges = changedRecords[recordId];
            const changedFieldIds = recordChanges?.current?.cellValuesByFieldId
                ? Object.keys(recordChanges.current.cellValuesByFieldId)
                : [];

            if (!changedFieldIds.includes(targetFieldId)) {
                console.log(`Skipping record ${recordId} - target field not changed`);
                continue;
            }

            console.log(`Processing record ${recordId} - target field was changed`);

            try {
                recordDetails = await fetchRecord(
                    "tblgMDhb1xvmg72ha",
                    recordId,
                    baseId
                );
                console.log("Fetched record details:", recordDetails);
                const mockupText = recordDetails?.fields?.["Mokcup Text"];
                console.log("mockupText", mockupText);
                await runPup(mockupText);
            } catch (error) {
                console.error(`Failed to fetch record ${recordId}:`, error);
            }
        }
    } catch (error) {
        console.error("Failed to process webhook:", error);
        return res.sendStatus(500);
    }

    console.log("===============Execution Completed=============");
    res.send(recordDetails);
}

app.post("/airtable-webhook", processWebhook);

app.get("/", (req, res) => {
    res.send("App is running");
});

app.get("/new-req", async (req, res) => {
    console.log("inside new req function");
    try {
        await runPup("Someone name");
        // Return the success response
        return res.status(200).json({ msg: "API successfully called" });
    } catch (error) {
        // Handle any errors that occur during the runPup call
        console.error("Error during API call:", error);
        return res
            .status(500)
            .json({ msg: "An error occurred", error: error.message });
    }
});

app.listen(5000, () => {
    console.log("App is running");
});

const waitForSeconds = (seconds) => {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
};

const uploadToCloudinary = async (imageBuffer) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                resource_type: "image",
                upload_preset: "pinterest",
            },
            (error, result) => {
                if (error) {
                    console.error("Error uploading to Cloudinary:", error);
                    return reject(error);
                } else {
                    console.log("Screenshot uploaded to Cloudinary:", result.secure_url);
                    resolve(result.secure_url);
                }
            }
        );

        // Create a readable stream from the buffer and pipe it to the upload stream
        const readableStream = new Readable();
        readableStream.push(imageBuffer);
        readableStream.push(null); // Indicates the end of the stream
        readableStream.pipe(uploadStream);
    });
};

const runPup = async (text) => {
    try {
        // Get the path to the Chromium executable
        const executablePath = await chromium.executablePath();
        console.log("Chromium executable path:", executablePath);

        // Launch Puppeteer with the specified arguments
        const browser = await puppeteer.launch({
            // headless : false,
            // executablePath : puppeteer.executablePath(),
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath,
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        console.log("Browser launched");
        const page = await browser.newPage();

        await page.goto("https://mockup.epiccraftings.com/");
        await page.setViewport({ width: 1900, height: 1024 });

        await page.waitForSelector(".form-control.txt_area_1");
        console.log("Selector found 1");

        await page.evaluate(() => {
            const textarea = document.querySelector(".form-control.txt_area_1");
            if (textarea) textarea.value = "";
        });

        console.log("Selector found 2");
        await page.type(".form-control.txt_area_1", text); // Use the `text` parameter here

        await page.evaluate(async () => {
            let fontDivs = Array.from(
                document.querySelectorAll("div.font-div[data-path]")
            );
            fontDivs = fontDivs.slice(1, 8);
            fontDivs.forEach((div) => div.click());
        });
        console.log("Selector found 3");

        await page.waitForSelector("#takeScreenShoot");
        console.log("Selector found 4");

        const clip = await page.evaluate(() => {
            const element = document.querySelector("#takeScreenShoot");
            if (element) {
                const { x, y, width, height } = element.getBoundingClientRect();
                return { x, y, width, height };
            }
            return null;
        });

        console.log("Selector found 5");

        // Generate a unique ID for the screenshot name
        const generateUniqueId = () =>
            "id-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);

        const screenShotName = `screenshot${generateUniqueId()}`;
        console.log("screenShotName", screenShotName);
        const screenshot_image_name = `${screenShotName}.png`;
        console.log("screenshot_image_name", screenshot_image_name);
        // const screenshotPath = path.join(
        //   __dirname,
        //   "tmp",
        //   screenshot_image_name
        // );

        const screenshotPath = path.join("/tmp", screenshot_image_name);
        console.log("screenshotPath:", screenshotPath);

        console.log("Selector found 6");

        if (clip) {
            // waitForSeconds(2);
            // await page.screenshot({ path: screenshotPath, clip , encoding : 'base64' });
            console.log(`inside clip`);

            //   const base64img =
            //     "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABVklEQVR42mJ8//8/AxYgBggAABgAAAoYFgCVAAAQAAAAABIAAAAAADUCGhMA0Qg1lCCkC1HQyFhAEyQAAAAAAB4xTxDHK2IFIIAhCkMgIMiBgZqUAFLAHTF4T7PwGQACMglwF5AU7kCAAYwAABWAIDQDOYDwChAAAAAElFTkSuQmCC";

            //   const createAndUploadImage = async (base64Data) => {
            //     // Remove the prefix "data:image/png;base64," if it exists
            //     const base64Image = base64Data.split(";base64,").pop();

            //     // Define the path to save the temporary PNG file
            //     const tempFilePath = path.join(__dirname, 'tmp', "tempImage.png");

            //     // Write the Base64 image to a file
            //     fs.writeFileSync(tempFilePath, base64Image, { encoding: "base64" });

            //     try {
            //       // Upload the temporary PNG file to Cloudinary
            //       const result = await cloudinary.uploader.upload(tempFilePath);
            //       console.log("Upload successful! Image URL:", result.secure_url);
            //     } catch (error) {
            //       console.error("Error uploading to Cloudinary:", error);
            //     } finally {
            //       // Clean up by deleting the temporary file
            //       fs.unlinkSync(tempFilePath);
            //       console.log("Temporary file deleted.");
            //     }
            //   };

            //   // Create and upload the image
            //   createAndUploadImage(base64img);

            //   // const filePath = path.join("/tmp", "output.txt");

            //   // // Define the text to write to the file
            //   // const textToWrite = "1,2,3";

            //   // // Write the text to the file
            //   // fs.writeFile(filePath, textToWrite, (err) => {
            //   //   if (err) {
            //   //     console.error("Error writing to file:", err);
            //   //   } else {
            //   //     console.log("File created successfully in /tmp:", filePath);
            //   //   }
            //   // });

            //   // const screenshotBuffer = await page.screenshot({ clip , path: screenshotPath , encoding : "base64"});
            //   // console.log(`Screenshot saved to: ${screenshotPath}` ,screenshotBuffer);
            //   // Upload the screenshot to Cloudinary
            //   // const imageUrl = await uploadToCloudinary(screenshotBuffer);
            //   // console.log('Uploaded Image URL:', imageUrl);
            const screenshotBuffer = await page.screenshot({ clip });

            // Upload the screenshot to Cloudinary
            const imageUrl = await uploadToCloudinary(screenshotBuffer);
            console.log('Uploaded Image URL:', imageUrl);
        } else {
            console.log("Element with ID 'takeScreenShoot' not found.");
            // Ensure the browser closes in case of error
            return; // Exit the function if the clip is not found
        }
        // await browser.close();

        // console.log("Selector found 7");

        // const pdfPath = path.join(__dirname, "public", "sample", "sample.pdf");
        // const existingPdfBytes = fs.readFileSync(pdfPath);

        // // Create a new PDF document
        // const pdfDoc = await PDFDocument.load(existingPdfBytes);

        // // Embed the screenshot as an image
        // const imgBytes = fs.readFileSync(screenshotPath);
        // const img = await pdfDoc.embedPng(imgBytes);

        // // Get the dimensions of the second page
        // const pages = pdfDoc.getPages();
        // const pageToReplace = pages[1]; // Index 1 corresponds to the second page
        // const { width: pageWidth, height: pageHeight } = pageToReplace.getSize();

        // // Calculate the scaled height to maintain aspect ratio of the image
        // const imgDims = img.scale(pageWidth / img.width);

        // // Draw the image on the second page, clearing the existing content
        // pageToReplace.drawImage(img, {
        //   x: 0,
        //   y: pageHeight - imgDims.height, // Align the image to the top of the page
        //   width: pageWidth,
        //   height: imgDims.height,
        // });

        // // Serialize the updated PDF document to bytes
        // const pdfBytes = await pdfDoc.save();

        // console.log("PDF updated in memory");

        // // Write the new PDF file to disk
        // const updatedPdfPath = path.join(
        //   __dirname,
        //   "public",
        //   "uploads",
        //   `${screenShotName}.pdf`
        // );
        // fs.writeFileSync(updatedPdfPath, pdfBytes);
        // console.log(`Updated PDF created at: ${updatedPdfPath}`);

        // Close the browser
        await browser.close();
    } catch (error) {
        console.error("Puppeteer error:", error);
    }
};

// runPup("BILAL");
