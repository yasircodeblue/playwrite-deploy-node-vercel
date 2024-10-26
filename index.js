const express = require('express');
const { chromium } = require('playwright');
const app = express();
const PORT = 3000;

// Function to take a screenshot and return it
async function takeScreenshotAndUpload() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        // Navigate to the target page
        await page.goto('https://mockup.epiccraftings.com/');

        // Wait for textarea and input text
        console.log("Waiting for textarea...");
        await page.waitForSelector('.form-control.txt_area_1');
        await page.fill('.form-control.txt_area_1', 'Yasir');

        // Wait for font divs to load
        console.log("Processing font divs...");
        await page.waitForTimeout(2000); // Allow time for the page to load fully
        const fontDivs = await page.$$('div.font-div[data-path]');

        for (let i = 0; i < Math.min(fontDivs.length, 7); i++) { // Click the first 7 font divs
            await fontDivs[i].click();
            await page.waitForTimeout(500);
        }

        // Wait for the screenshot element to be available
        console.log("Waiting for screenshot element...");
        const screenshotElem = await page.waitForSelector('#takeScreenShoot');

        // Take a screenshot of the specified element
        await page.waitForTimeout(2000); // Add delay if necessary
        const screenshotBuffer = await screenshotElem.screenshot({ type: 'png' });
        console.log("Screenshot captured");

        // Here, you would add the upload logic to Imgbb
        // const screenshotUrl = await uploadToImgbb(screenshotBuffer);
        // return { "Screenshot URL": screenshotUrl };
        
        return { message: "Screenshot captured successfully." }; // Temporary return statement

    } catch (error) {
        console.error(`An error occurred: ${error}`);
        return { error: error.message };
    } finally {
        await browser.close();
    }
}

// API endpoint
app.get('/api/hey', async (req, res) => {
    const result = await takeScreenshotAndUpload();
    res.json(result);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
