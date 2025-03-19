import { chromium } from "playwright";

const BROWSER_COUNT = 10;
const BROWSER_WIDTH = 480; // Each browser window will be 480x360
const BROWSER_HEIGHT = 360;
const COLUMNS = 7;

const STEPS = {
  INITIALIZED: "Initialized",
  NAVIGATED_TO_EVENT_PAGE: "Navigated to JJ concert page",
  NAVIGATED_TO_QUEUE: "Navigatd to the queue",
};

const browsers = new Map();

const withTimeoutAndInfiniteRetry = async (
  action,
  { actionName, timeout = 10000, page }
) => {
  const tryAction = async () => {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(`${actionName}: Operation timed out after ${timeout}ms`)
        );
      }, timeout);
    });

    return Promise.race([action(), timeoutPromise]);
  };

  while (true) {
    try {
      await tryAction();
      console.log(`${actionName}: Success!`);
      return; // Exit the loop and function on success
    } catch (error) {
      console.log(`${actionName}: ${error.message}`);
      if (page) {
        console.log(`${actionName}: Refreshing page and retrying...`);
        await page.reload();
        // Wait a bit before retrying to avoid hammering the server
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        throw error; // If no page object, can't retry
      }
    }
  }
};

const launchBrowsers = async () => {
  try {
    console.log(`Launching ${BROWSER_COUNT} browser instances...`);

    // Calculate positions for a 4x3 grid layout
    const positions = [];
    for (let row = 0; row < Math.ceil(BROWSER_COUNT / COLUMNS); row++) {
      for (let col = 0; col < COLUMNS; col++) {
        positions.push({
          x: col * BROWSER_WIDTH,
          y: row * BROWSER_HEIGHT,
        });
      }
    }

    // Launch browser instances in parallel
    await Promise.all(
      Array.from({ length: BROWSER_COUNT }, async (_, i) => {
        console.log(`Launching browser ${i + 1}...`);
        const browser = await chromium.launch({
          headless: false,
          args: [
            `--window-position=${positions[i].x},${positions[i].y}`,
            `--window-size=${BROWSER_WIDTH + 16},${BROWSER_HEIGHT + 88}`, // Add padding for browser chrome
          ],
        });

        // Create context with specific viewport size
        const context = await browser.newContext({
          viewport: { width: BROWSER_WIDTH, height: BROWSER_HEIGHT },
          screen: { width: BROWSER_WIDTH, height: BROWSER_HEIGHT },
        });

        // Add browser to map with initial state
        browsers.set(i, {
          browser,
          context,
          step: STEPS.INITIALIZED,
        });

        const page = await context.newPage();

        // Step 1: go to the event page
        await withTimeoutAndInfiniteRetry(
          async () => {
            // Early return if browser has already navigated to the event page
            if (browsers.get(i).step === STEPS.NAVIGATED_TO_EVENT_PAGE) {
              return;
            }

            await page.goto("https://www.cityline.com/zh_HK/Events.html");
            await page.waitForSelector("span.event-tag");

            const jjEventLink = await page
              .locator('a:has(span.event-tag:text("JJ"))')
              .first();

            await jjEventLink.click();

            // Update step after successful navigation
            browsers.get(i).step = STEPS.NAVIGATED_TO_EVENT_PAGE;
          },
          {
            actionName: STEPS.NAVIGATED_TO_EVENT_PAGE,
            timeout: 3000,
            page,
          }
        );
      })
    );

    console.log("All browsers launched and positioned!");
    console.log("Press Ctrl+C to close all browsers and exit");
  } catch (error) {
    console.error("An error occurred:", error);
  }
};

launchBrowsers();
