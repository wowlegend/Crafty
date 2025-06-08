#!/usr/bin/env python3
import requests
import json
import time
import sys
import os
import concurrent.futures
import statistics
import uuid
from datetime import datetime

# Get the backend URL from the frontend .env file
BACKEND_URL = None
try:
    with open('/app/frontend/.env', 'r') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BACKEND_URL = line.strip().split('=')[1].strip('"\'')
                break
except Exception as e:
    print(f"Error reading frontend/.env file: {e}")
    sys.exit(1)

if not BACKEND_URL:
    print("Error: REACT_APP_BACKEND_URL not found in frontend/.env")
    sys.exit(1)

# Ensure BACKEND_URL ends with /api
API_URL = f"{BACKEND_URL}/api"
print(f"Using API URL: {API_URL}")

# Test data
TEST_USER = {
    "username": f"testuser_{int(time.time())}",  # Ensure unique username
    "email": f"test{int(time.time())}@example.com",  # Ensure unique email
    "password": "testpass123"
}

TEST_WORLD = {
    "name": f"Test World {int(time.time())}",
    "world_data": {
        "blocks": [
            {"x": 0, "y": 0, "z": 0, "type": "grass"},
            {"x": 1, "y": 0, "z": 0, "type": "dirt"}
        ]
    },
    "settings": {
        "gameMode": "creative",
        "difficulty": "peaceful"
    },
    "is_public": True
}

TEST_CHAT_MESSAGE = "Hello, this is a test message!"

# Store session data
session_data = {
    "access_token": None,
    "user_id": None,
    "world_id": None,
    "save_id": None
}

# Test results
test_results = {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "tests": []
}

def run_test(name, test_func):
    """Run a test and record the result"""
    test_results["total"] += 1
    print(f"\n{'='*80}\nRunning test: {name}\n{'='*80}")
    
    start_time = time.time()
    try:
        result = test_func()
        success = result.get("success", False)
        if success:
            test_results["passed"] += 1
            status = "PASSED"
        else:
            test_results["failed"] += 1
            status = "FAILED"
    except Exception as e:
        test_results["failed"] += 1
        status = "ERROR"
        result = {"success": False, "error": str(e)}
    
    duration = time.time() - start_time
    
    test_results["tests"].append({
        "name": name,
        "status": status,
        "duration": duration,
        "result": result
    })
    
    print(f"Test {status}: {name} ({duration:.2f}s)")
    if status != "PASSED":
        print(f"Error: {result.get('error', 'Unknown error')}")
    return result

def test_api_health():
    """Test 1: API Health Check - GET /api/"""
    try:
        response = requests.get(f"{API_URL}/")
        response.raise_for_status()
        data = response.json()
        
        if "message" in data and "status" in data and data["status"] == "running":
            return {
                "success": True,
                "data": data
            }
        else:
            return {
                "success": False,
                "error": "Invalid response format",
                "data": data
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_user_registration():
    """Test 2: User Registration - POST /api/auth/register"""
    try:
        response = requests.post(
            f"{API_URL}/auth/register",
            json=TEST_USER
        )
        
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data and "user" in data:
                # Store token for future tests
                session_data["access_token"] = data["access_token"]
                session_data["user_id"] = data["user"]["id"]
                
                return {
                    "success": True,
                    "data": data
                }
            else:
                return {
                    "success": False,
                    "error": "Invalid response format",
                    "data": data
                }
        else:
            return {
                "success": False,
                "error": f"HTTP {response.status_code}: {response.text}",
                "data": response.json() if response.text else None
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_user_registration_duplicate():
    """Test 3: User Registration (Duplicate) - POST /api/auth/register"""
    try:
        response = requests.post(
            f"{API_URL}/auth/register",
            json=TEST_USER  # Same user data as before
        )
        
        # Should fail with 400 Bad Request
        if response.status_code == 400:
            return {
                "success": True,
                "data": response.json()
            }
        else:
            return {
                "success": False,
                "error": f"Expected HTTP 400, got {response.status_code}",
                "data": response.json() if response.text else None
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_user_login():
    """Test 4: User Login - POST /api/auth/login"""
    try:
        login_data = {
            "username": TEST_USER["username"],
            "password": TEST_USER["password"]
        }
        
        response = requests.post(
            f"{API_URL}/auth/login",
            json=login_data
        )
        
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data and "user" in data:
                # Update token
                session_data["access_token"] = data["access_token"]
                
                return {
                    "success": True,
                    "data": data
                }
            else:
                return {
                    "success": False,
                    "error": "Invalid response format",
                    "data": data
                }
        else:
            return {
                "success": False,
                "error": f"HTTP {response.status_code}: {response.text}",
                "data": response.json() if response.text else None
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_user_login_invalid():
    """Test 5: User Login (Invalid) - POST /api/auth/login"""
    try:
        login_data = {
            "username": TEST_USER["username"],
            "password": "wrongpassword"
        }
        
        response = requests.post(
            f"{API_URL}/auth/login",
            json=login_data
        )
        
        # Should fail with 401 Unauthorized
        if response.status_code == 401:
            return {
                "success": True,
                "data": response.json()
            }
        else:
            return {
                "success": False,
                "error": f"Expected HTTP 401, got {response.status_code}",
                "data": response.json() if response.text else None
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_protected_route():
    """Test 6: Protected Route - GET /api/auth/me"""
    if not session_data["access_token"]:
        return {
            "success": False,
            "error": "No access token available"
        }
    
    try:
        headers = {
            "Authorization": f"Bearer {session_data['access_token']}"
        }
        
        response = requests.get(
            f"{API_URL}/auth/me",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            if "id" in data and "username" in data:
                return {
                    "success": True,
                    "data": data
                }
            else:
                return {
                    "success": False,
                    "error": "Invalid response format",
                    "data": data
                }
        else:
            return {
                "success": False,
                "error": f"HTTP {response.status_code}: {response.text}",
                "data": response.json() if response.text else None
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_protected_route_invalid_token():
    """Test 7: Protected Route (Invalid Token) - GET /api/auth/me"""
    try:
        headers = {
            "Authorization": "Bearer invalid_token"
        }
        
        response = requests.get(
            f"{API_URL}/auth/me",
            headers=headers
        )
        
        # Should fail with 401 Unauthorized
        if response.status_code == 401:
            return {
                "success": True,
                "data": response.json()
            }
        else:
            return {
                "success": False,
                "error": f"Expected HTTP 401, got {response.status_code}",
                "data": response.json() if response.text else None
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_world_creation():
    """Test 8: World Creation - POST /api/worlds"""
    if not session_data["access_token"]:
        return {
            "success": False,
            "error": "No access token available"
        }
    
    try:
        headers = {
            "Authorization": f"Bearer {session_data['access_token']}"
        }
        
        response = requests.post(
            f"{API_URL}/worlds",
            headers=headers,
            json=TEST_WORLD
        )
        
        if response.status_code == 200:
            data = response.json()
            if "world_id" in data:
                # Store world ID for future tests
                session_data["world_id"] = data["world_id"]
                
                return {
                    "success": True,
                    "data": data
                }
            else:
                return {
                    "success": False,
                    "error": "Invalid response format",
                    "data": data
                }
        else:
            return {
                "success": False,
                "error": f"HTTP {response.status_code}: {response.text}",
                "data": response.json() if response.text else None
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_world_retrieval():
    """Test 9: World Retrieval - GET /api/worlds"""
    if not session_data["access_token"]:
        return {
            "success": False,
            "error": "No access token available"
        }
    
    try:
        headers = {
            "Authorization": f"Bearer {session_data['access_token']}"
        }
        
        response = requests.get(
            f"{API_URL}/worlds",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                # Check if our created world is in the list
                world_found = False
                for world in data:
                    if "id" in world and world["id"] == session_data["world_id"]:
                        world_found = True
                        break
                
                if world_found:
                    return {
                        "success": True,
                        "data": data
                    }
                else:
                    return {
                        "success": False,
                        "error": "Created world not found in list",
                        "data": data
                    }
            else:
                return {
                    "success": False,
                    "error": "Invalid response format (expected list)",
                    "data": data
                }
        else:
            return {
                "success": False,
                "error": f"HTTP {response.status_code}: {response.text}",
                "data": response.json() if response.text else None
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_world_details():
    """Test 10: World Details - GET /api/worlds/{world_id}"""
    if not session_data["access_token"] or not session_data["world_id"]:
        return {
            "success": False,
            "error": "No access token or world ID available"
        }
    
    try:
        headers = {
            "Authorization": f"Bearer {session_data['access_token']}"
        }
        
        response = requests.get(
            f"{API_URL}/worlds/{session_data['world_id']}",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            if "id" in data and data["id"] == session_data["world_id"]:
                return {
                    "success": True,
                    "data": data
                }
            else:
                return {
                    "success": False,
                    "error": "Invalid response format or wrong world ID",
                    "data": data
                }
        else:
            return {
                "success": False,
                "error": f"HTTP {response.status_code}: {response.text}",
                "data": response.json() if response.text else None
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_chat_system():
    """Test 11: Chat System - POST /api/worlds/{world_id}/chat"""
    if not session_data["access_token"] or not session_data["world_id"]:
        return {
            "success": False,
            "error": "No access token or world ID available"
        }
    
    try:
        headers = {
            "Authorization": f"Bearer {session_data['access_token']}"
        }
        
        # The server.py expects a 'message' parameter
        response = requests.post(
            f"{API_URL}/worlds/{session_data['world_id']}/chat",
            headers=headers,
            params={"message": TEST_CHAT_MESSAGE}
        )
        
        if response.status_code == 200:
            data = response.json()
            if "id" in data and "message" in data and data["message"] == TEST_CHAT_MESSAGE:
                return {
                    "success": True,
                    "data": data
                }
            else:
                return {
                    "success": False,
                    "error": "Invalid response format or message mismatch",
                    "data": data
                }
        else:
            return {
                "success": False,
                "error": f"HTTP {response.status_code}: {response.text}",
                "data": response.json() if response.text else None
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_chat_retrieval():
    """Test 12: Chat Retrieval - GET /api/worlds/{world_id}/chat"""
    if not session_data["access_token"] or not session_data["world_id"]:
        return {
            "success": False,
            "error": "No access token or world ID available"
        }
    
    try:
        headers = {
            "Authorization": f"Bearer {session_data['access_token']}"
        }
        
        response = requests.get(
            f"{API_URL}/worlds/{session_data['world_id']}/chat",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                # Check if our message is in the list
                message_found = False
                for msg in data:
                    if "message" in msg and msg["message"] == TEST_CHAT_MESSAGE:
                        message_found = True
                        break
                
                if message_found:
                    return {
                        "success": True,
                        "data": data
                    }
                else:
                    return {
                        "success": False,
                        "error": "Sent message not found in chat history",
                        "data": data
                    }
            else:
                return {
                    "success": False,
                    "error": "Invalid response format (expected list)",
                    "data": data
                }
        else:
            return {
                "success": False,
                "error": f"HTTP {response.status_code}: {response.text}",
                "data": response.json() if response.text else None
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_api_performance():
    """Test 13: API Performance - Check response times for key endpoints"""
    if not session_data["access_token"] or not session_data["world_id"]:
        return {
            "success": False,
            "error": "No access token or world ID available"
        }
    
    try:
        headers = {
            "Authorization": f"Bearer {session_data['access_token']}"
        }
        
        # Test endpoints to measure
        endpoints = [
            {"name": "Health Check", "url": f"{API_URL}/", "method": "get", "data": None},
            {"name": "User Info", "url": f"{API_URL}/auth/me", "method": "get", "data": None},
            {"name": "World List", "url": f"{API_URL}/worlds", "method": "get", "data": None},
            {"name": "World Details", "url": f"{API_URL}/worlds/{session_data['world_id']}", "method": "get", "data": None},
            {"name": "Chat Messages", "url": f"{API_URL}/worlds/{session_data['world_id']}/chat", "method": "get", "data": None}
        ]
        
        results = {}
        all_response_times = []
        
        # Make 5 requests to each endpoint to get average response time
        for endpoint in endpoints:
            response_times = []
            
            for _ in range(5):
                start_time = time.time()
                
                if endpoint["method"] == "get":
                    response = requests.get(endpoint["url"], headers=headers)
                elif endpoint["method"] == "post":
                    response = requests.post(endpoint["url"], headers=headers, json=endpoint["data"])
                
                end_time = time.time()
                response_time = (end_time - start_time) * 1000  # Convert to ms
                response_times.append(response_time)
                all_response_times.append(response_time)
                
                # Ensure we don't overwhelm the server
                time.sleep(0.1)
            
            avg_response_time = sum(response_times) / len(response_times)
            results[endpoint["name"]] = {
                "avg_response_time_ms": avg_response_time,
                "min_ms": min(response_times),
                "max_ms": max(response_times)
            }
        
        # Calculate overall stats
        overall_avg = sum(all_response_times) / len(all_response_times)
        
        # Check if any endpoint is slower than 200ms
        slow_endpoints = [name for name, data in results.items() if data["avg_response_time_ms"] > 200]
        
        if slow_endpoints:
            return {
                "success": False,
                "error": f"Some endpoints are slower than 200ms: {', '.join(slow_endpoints)}",
                "data": {
                    "endpoint_results": results,
                    "overall_avg_ms": overall_avg
                }
            }
        else:
            return {
                "success": True,
                "data": {
                    "endpoint_results": results,
                    "overall_avg_ms": overall_avg
                }
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_concurrent_requests():
    """Test 14: Concurrent Requests - Test API under concurrent load"""
    if not session_data["access_token"] or not session_data["world_id"]:
        return {
            "success": False,
            "error": "No access token or world ID available"
        }
    
    try:
        headers = {
            "Authorization": f"Bearer {session_data['access_token']}"
        }
        
        # Function to make a request to the worlds endpoint
        def make_request():
            start_time = time.time()
            response = requests.get(f"{API_URL}/worlds", headers=headers)
            end_time = time.time()
            
            return {
                "status_code": response.status_code,
                "response_time": (end_time - start_time) * 1000  # Convert to ms
            }
        
        # Make 10 concurrent requests
        num_requests = 10
        response_times = []
        failed_requests = 0
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_requests) as executor:
            futures = [executor.submit(make_request) for _ in range(num_requests)]
            
            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                if result["status_code"] == 200:
                    response_times.append(result["response_time"])
                else:
                    failed_requests += 1
        
        if failed_requests > 0:
            return {
                "success": False,
                "error": f"{failed_requests} out of {num_requests} concurrent requests failed",
                "data": {
                    "avg_response_time_ms": sum(response_times) / len(response_times) if response_times else 0,
                    "min_ms": min(response_times) if response_times else 0,
                    "max_ms": max(response_times) if response_times else 0,
                    "std_dev_ms": statistics.stdev(response_times) if len(response_times) > 1 else 0
                }
            }
        else:
            avg_response_time = sum(response_times) / len(response_times)
            
            # Check if average response time is under 500ms for concurrent requests
            if avg_response_time > 500:
                return {
                    "success": False,
                    "error": f"Average response time for concurrent requests is too high: {avg_response_time:.2f}ms",
                    "data": {
                        "avg_response_time_ms": avg_response_time,
                        "min_ms": min(response_times),
                        "max_ms": max(response_times),
                        "std_dev_ms": statistics.stdev(response_times) if len(response_times) > 1 else 0
                    }
                }
            else:
                return {
                    "success": True,
                    "data": {
                        "avg_response_time_ms": avg_response_time,
                        "min_ms": min(response_times),
                        "max_ms": max(response_times),
                        "std_dev_ms": statistics.stdev(response_times) if len(response_times) > 1 else 0
                    }
                }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_error_handling():
    """Test 15: Error Handling - Test API error responses for edge cases"""
    if not session_data["access_token"]:
        return {
            "success": False,
            "error": "No access token available"
        }
    
    try:
        headers = {
            "Authorization": f"Bearer {session_data['access_token']}"
        }
        
        # Test cases for error handling
        test_cases = [
            {
                "name": "Missing Required Field",
                "endpoint": f"{API_URL}/worlds",
                "method": "post",
                "data": {"settings": {}},  # Missing 'name' and 'world_data'
                "expected_status": 422  # Validation error
            },
            {
                "name": "Invalid World ID",
                "endpoint": f"{API_URL}/worlds/invalid-uuid-format",
                "method": "get",
                "data": None,
                "expected_status": 404  # Not found
            },
            {
                "name": "Non-existent World",
                "endpoint": f"{API_URL}/worlds/{str(uuid.uuid4())}",  # Random UUID
                "method": "get",
                "data": None,
                "expected_status": 404  # Not found
            }
        ]
        
        results = {}
        all_passed = True
        
        for test_case in test_cases:
            if test_case["method"] == "get":
                response = requests.get(test_case["endpoint"], headers=headers)
            elif test_case["method"] == "post":
                response = requests.post(test_case["endpoint"], headers=headers, json=test_case["data"])
            
            passed = response.status_code == test_case["expected_status"]
            
            results[test_case["name"]] = {
                "passed": passed,
                "expected_status": test_case["expected_status"],
                "actual_status": response.status_code,
                "response": response.json() if response.text else None
            }
            
            if not passed:
                all_passed = False
        
        if all_passed:
            return {
                "success": True,
                "data": results
            }
        else:
            failed_cases = [name for name, data in results.items() if not data["passed"]]
            return {
                "success": False,
                "error": f"Some error handling tests failed: {', '.join(failed_cases)}",
                "data": results
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_database_stability():
    """Test 16: Database Stability - Test database connection stability"""
    try:
        # Make 20 sequential requests to an endpoint that requires DB access
        num_requests = 20
        success_count = 0
        response_times = []
        
        for i in range(num_requests):
            start_time = time.time()
            response = requests.get(f"{API_URL}/")
            end_time = time.time()
            
            if response.status_code == 200:
                success_count += 1
                response_times.append((end_time - start_time) * 1000)  # Convert to ms
            
            # Small delay to avoid overwhelming the server
            time.sleep(0.1)
        
        # Check if all requests were successful
        if success_count == num_requests:
            # Check if response times are stable (not increasing)
            first_half_avg = sum(response_times[:num_requests//2]) / (num_requests//2)
            second_half_avg = sum(response_times[num_requests//2:]) / (num_requests - num_requests//2)
            
            # If second half average is significantly higher (>100%), it might indicate degradation
            if second_half_avg > first_half_avg * 2.0:
                return {
                    "success": False,
                    "error": f"Response times are increasing, possible performance degradation",
                    "data": {
                        "first_half_avg_ms": first_half_avg,
                        "second_half_avg_ms": second_half_avg,
                        "all_response_times_ms": response_times
                    }
                }
            else:
                return {
                    "success": True,
                    "data": {
                        "success_rate": f"{success_count}/{num_requests}",
                        "avg_response_time_ms": sum(response_times) / len(response_times),
                        "first_half_avg_ms": first_half_avg,
                        "second_half_avg_ms": second_half_avg
                    }
                }
        else:
            return {
                "success": False,
                "error": f"Only {success_count} out of {num_requests} requests were successful",
                "data": {
                    "success_rate": f"{success_count}/{num_requests}"
                }
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def run_all_tests():
    """Run all tests in sequence"""
    print(f"Starting backend API tests at {datetime.now().isoformat()}")
    print(f"API URL: {API_URL}")
    
    # Run basic functionality tests
    run_test("API Health Check", test_api_health)
    run_test("User Registration", test_user_registration)
    run_test("User Registration (Duplicate)", test_user_registration_duplicate)
    run_test("User Login", test_user_login)
    run_test("User Login (Invalid)", test_user_login_invalid)
    run_test("Protected Route", test_protected_route)
    run_test("Protected Route (Invalid Token)", test_protected_route_invalid_token)
    run_test("World Creation", test_world_creation)
    run_test("World Retrieval", test_world_retrieval)
    run_test("World Details", test_world_details)
    run_test("Chat System", test_chat_system)
    run_test("Chat Retrieval", test_chat_retrieval)
    
    # Run performance and stability tests
    run_test("API Performance", test_api_performance)
    run_test("Concurrent Requests", test_concurrent_requests)
    run_test("Error Handling", test_error_handling)
    run_test("Database Stability", test_database_stability)
    
    # Print summary
    print(f"\n{'='*80}\nTest Summary\n{'='*80}")
    print(f"Total tests: {test_results['total']}")
    print(f"Passed: {test_results['passed']}")
    print(f"Failed: {test_results['failed']}")
    print(f"Success rate: {(test_results['passed'] / test_results['total']) * 100:.2f}%")
    
    # Print detailed results for failed tests
    if test_results['failed'] > 0:
        print(f"\n{'='*80}\nFailed Tests\n{'='*80}")
        for test in test_results['tests']:
            if test['status'] != "PASSED":
                print(f"- {test['name']}: {test['result'].get('error', 'Unknown error')}")
    
    return test_results

if __name__ == "__main__":
    run_all_tests()
