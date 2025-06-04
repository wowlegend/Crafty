#!/usr/bin/env python3
import requests
import json
import time
import sys
import os
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
    "world_id": None
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

def run_all_tests():
    """Run all tests in sequence"""
    print(f"Starting backend API tests at {datetime.now().isoformat()}")
    print(f"API URL: {API_URL}")
    
    # Run tests in sequence
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
