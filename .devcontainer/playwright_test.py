import asyncio
from playwright.async_api import async_playwright
import argparse
from datetime import datetime
import os


async def capture_page(url: str, output_dir: str = "screenshots", capture_logs: bool = False):
    """
    Captures a full-page screenshot and console logs from the specified URL.

    Args:
        url (str): The URL to capture
        output_dir (str): Directory to save screenshots and logs
        :param capture_logs:
    """

    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)

    # Generate timestamp for unique filenames
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    async with async_playwright() as p:
        # Launch the browser
        browser = await p.chromium.launch(headless=True)

        # Create a new context and page
        context = await browser.new_context()
        page = await context.new_page()

        # Store console logs
        console_logs = []

        if capture_logs:
            # Console log handler
            page.on("console", lambda msg: console_logs.append(f"{msg.type}: {msg.text}"))

        try:
            # Navigate to the URL
            await page.goto(url, wait_until="networkidle")

            # Wait for any animations or dynamic content to settle
            await page.wait_for_timeout(2000)

            # Take full page screenshot
            screenshot_path = os.path.join(output_dir, f"screenshot.jpeg")
            await page.screenshot(
                path=screenshot_path,
                full_page=True,
                type="jpeg",
                quality = 50  # Add this line - adjust value between 0-100
            )
            # print(f"Screenshot saved to: {screenshot_path}")

            if capture_logs:
                # Save console logs
                log_path = os.path.join(output_dir, f"console_logs_{timestamp}.txt")
                with open(log_path, "w", encoding="utf-8") as f:
                    f.write(f"Console logs for {url}\n")
                    f.write("=" * 50 + "\n")
                    f.write("\n".join(console_logs))
                # print(f"Console logs saved to: {log_path}")
            print("Screenshot Generated")
        except Exception as e:
            print(f"Error capturing page: {str(e)}")

        finally:
            await browser.close()


def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Capture webpage screenshot and console logs")
    parser.add_argument("url", help="URL to capture")
    parser.add_argument("--console", help="Should Capture to capture")
    parser.add_argument("--output", "-o", default="screenshots",
                        help="Output directory for screenshots and logs")
    args = parser.parse_args()

    # Run the async capture function
    asyncio.run(capture_page(args.url, args.output, args.console is not None))


if __name__ == "__main__":
    main()
