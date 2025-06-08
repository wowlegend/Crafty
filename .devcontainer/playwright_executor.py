import asyncio
from playwright.async_api import async_playwright
import argparse
from datetime import datetime
import os
import json
from pathlib import Path
import tempfile
import base64

async def execute_playwright_script(url: str, script: str, output_dir: str = ".screenshots", capture_logs: bool = False):
    """
    Executes a Playwright script and captures outputs.
    """
    # Create output directory
    
    automation_output_dir = 'automation_output'

    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(automation_output_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = Path(automation_output_dir) / timestamp
    run_dir.mkdir(exist_ok=True)

    screenshot_dir = Path(output_dir)
    screenshot_dir.mkdir(exist_ok=True)
    
    result = {
        "status": "success",
        "data": {
            "screenshots": [],
            "console_logs": [],
            "error": None,
            "output": None
        }
    }

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            # Store console logs if requested
            console_logs = []
            if capture_logs:
                page.on("console", lambda msg: console_logs.append(f"{msg.type}: {msg.text}"))
            
            try:
                # Navigate to URL first
                await page.goto(url, wait_until="networkidle", timeout=30000)
                
                # Decode script if base64 encoded
                if script.startswith('base64:'):
                    script = base64.b64decode(script[7:]).decode('utf-8')
                
                # Add proper indentation to the script
                indented_script = ""
                for line in script.split('\n'):
                    if line.strip():
                        indented_script += "    " + line + "\n"
                    else:
                        indented_script += "\n"
                
                # Create test script with proper indentation
                test_script = f"""async def run_test(page, output_dir):
{indented_script}"""

                # Write the test script to a file for debugging
                test_script_path = run_dir / "test_script.py"
                with open(test_script_path, "w") as f:
                    f.write(test_script)

                # Save script to temp file for execution
                with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                    f.write(test_script)
                    script_path = f.name

                # Import and execute the script
                import importlib.util
                spec = importlib.util.spec_from_file_location("dynamic_script", script_path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                
                # Run the test
                output = await module.run_test(page, str(run_dir))
                if output is not None:
                    result["data"]["output"] = output
                
                # Take a screenshot if none were taken
                screenshot_files = list(run_dir.glob('*.{png,jpg,jpeg}'))
                if not screenshot_files:
                    final_screenshot = run_dir / f"final_{timestamp}.png"
                    await page.screenshot(
                        path=str(final_screenshot),
                        full_page=True,
                        type="jpeg",
                        quality = 50
                    )
                    result["data"]["screenshots"].append(str(final_screenshot))

                    # Save additional screenshot to .screenshot folder
                    await page.screenshot(
                        path=str(screenshot_dir / "screenshot.jpeg"),
                        full_page=True,
                        type="jpeg",
                        quality = 50
                    )
                else:
                    result["data"]["screenshots"].extend(str(f) for f in screenshot_files)

                # Save console logs if captured
                if capture_logs and console_logs:
                    log_path = run_dir / f"console_{timestamp}.log"
                    with open(log_path, "w", encoding="utf-8") as f:
                        f.write("\n".join(console_logs))
                    result["data"]["console_logs"].append(str(log_path))

            except Exception as e:
                result["status"] = "error"
                result["data"]["error"] = f"Script error: {str(e)}"
                error_screenshot = run_dir / f"error_{timestamp}.png"
                await page.screenshot(
                        path=str(error_screenshot),
                        full_page=True,
                        type="jpeg",
                        quality = 50
                    )
                result["data"]["screenshots"].append(str(error_screenshot))

                # Save additional screenshot to .screenshot folder
                await page.screenshot(
                        path=str(screenshot_dir / "screenshot.jpeg"),
                        full_page=True,
                        type="jpeg",
                        quality = 50
                    )
            
            finally:
                if os.path.exists(script_path):
                    os.unlink(script_path)
                await browser.close()

    except Exception as e:
        result["status"] = "error"
        result["data"]["error"] = f"Setup error: {str(e)}"

    return result

def main():
    parser = argparse.ArgumentParser(description="Execute Playwright automation script")
    parser.add_argument("url", help="URL to automate")
    parser.add_argument("--script", required=True, help="Playwright script to execute (plain text or base64 encoded with 'base64:' prefix)")
    parser.add_argument("--output", "-o", default=".screenshots",
                        help="Output directory for screenshots and logs")
    parser.add_argument("--capture-logs", action="store_true", help="Capture console logs")
    
    args = parser.parse_args()
    
    result = asyncio.run(execute_playwright_script(
        args.url,
        args.script,
        args.output,
        args.capture_logs
    ))
    
    print(json.dumps(result))

if __name__ == "__main__":
    main()