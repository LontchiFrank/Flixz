import requests
import sys
import json
from datetime import datetime

class EnhancedFeaturesAPITester:
    def __init__(self, base_url="https://watchparty-72.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.user_data = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if headers:
            test_headers.update(headers)
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    if isinstance(response_data, dict):
                        if 'notifications' in response_data:
                            print(f"   Notifications count: {len(response_data['notifications'])}")
                        elif 'items' in response_data:
                            print(f"   Items count: {len(response_data['items'])}")
                        elif 'my_list_count' in response_data:
                            print(f"   Stats: My List: {response_data['my_list_count']}, Continue Watching: {response_data['continue_watching_count']}, Parties Hosted: {response_data['watch_parties_hosted']}")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Response: {response.text[:200]}")
                self.failed_tests.append({
                    'name': name,
                    'expected': expected_status,
                    'actual': response.status_code,
                    'endpoint': endpoint
                })
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append({
                'name': name,
                'error': str(e),
                'endpoint': endpoint
            })
            return False, {}

    def setup_test_user(self):
        """Create and login a test user"""
        timestamp = datetime.now().strftime("%H%M%S")
        test_user = {
            "email": f"enhanced_test_{timestamp}@example.com",
            "password": "TestPass123!",
            "name": f"Enhanced Test User {timestamp}"
        }
        
        success, response = self.run_test("User Registration", "POST", "/auth/register", 200, test_user)
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_data = response['user']
            print(f"   Registered user: {self.user_data['email']}")
            return True
        return False

    def test_user_stats_api(self):
        """Test GET /api/user/stats endpoint"""
        if not self.token:
            print("❌ No token available for user stats test")
            return False
            
        success, response = self.run_test("User Stats API", "GET", "/user/stats", 200)
        
        if success:
            # Verify response structure
            required_fields = ['my_list_count', 'continue_watching_count', 'watch_parties_hosted']
            for field in required_fields:
                if field not in response:
                    print(f"❌ Missing field in response: {field}")
                    return False
            print(f"   ✅ All required stats fields present")
        
        return success

    def test_notifications_api(self):
        """Test GET /api/notifications endpoint"""
        if not self.token:
            print("❌ No token available for notifications test")
            return False
            
        success, response = self.run_test("Notifications API", "GET", "/notifications", 200)
        
        if success:
            # Verify response structure
            if 'notifications' not in response:
                print(f"❌ Missing 'notifications' field in response")
                return False
            print(f"   ✅ Notifications API working correctly")
        
        return success

    def test_continue_watching_api(self):
        """Test Continue Watching functionality"""
        if not self.token:
            print("❌ No token available for continue watching test")
            return False

        # Test getting continue watching items
        get_success, _ = self.run_test("Get Continue Watching", "GET", "/continue-watching", 200)
        
        if not get_success:
            return False

        # Test adding a continue watching item
        test_item = {
            "media_id": 299536,
            "media_type": "movie",
            "title": "Avengers: Endgame",
            "poster_path": "/or06FN3Dka5tukK1e9sl16pB3iy.jpg",
            "progress": 45.5,
            "duration": 181.0
        }
        
        add_success, _ = self.run_test("Add Continue Watching", "POST", "/continue-watching", 200, test_item)
        
        return add_success

    def test_watch_party_invite_api(self):
        """Test Watch Party invite functionality"""
        if not self.token:
            print("❌ No token available for watch party invite test")
            return False

        # First create a watch party
        party_data = {
            "name": "Enhanced Test Party",
            "movie_id": 299536,
            "media_type": "movie"
        }
        
        create_success, response = self.run_test("Create Watch Party for Invite", "POST", "/watch-party", 200, party_data)
        
        if not create_success or 'room_id' not in response:
            return False
            
        room_id = response['room_id']
        print(f"   Created room for invite test: {room_id}")

        # Test sending invite (this should fail since we're inviting non-existent user, but API should handle gracefully)
        invite_url = f"/notifications/invite?room_id={room_id}&invitee_email=nonexistent@example.com"
        invite_success, _ = self.run_test("Send Watch Party Invite", "POST", invite_url, 404)  # Expecting 404 for non-existent user
        
        # Clean up - delete the party
        self.run_test("Cleanup Watch Party", "DELETE", f"/watch-party/{room_id}", 200)
        
        return invite_success

    def test_user_profile_api(self):
        """Test User Profile functionality"""
        if not self.token:
            print("❌ No token available for user profile test")
            return False

        # Test getting user profile
        get_success, response = self.run_test("Get User Profile", "GET", "/user/profile", 200)
        
        if not get_success:
            return False

        # Test updating user profile
        update_data = {
            "name": "Updated Enhanced Test User"
        }
        
        update_success, _ = self.run_test("Update User Profile", "PUT", "/user/profile", 200, update_data)
        
        return update_success

def main():
    print("🚀 Starting Enhanced Features API Testing...")
    print("=" * 60)
    
    tester = EnhancedFeaturesAPITester()
    
    # Setup test user
    print("\n👤 Setting up test user...")
    if not tester.setup_test_user():
        print("❌ Failed to setup test user. Exiting.")
        return 1
    
    print("\n📊 Testing User Stats API...")
    tester.test_user_stats_api()
    
    print("\n🔔 Testing Notifications API...")
    tester.test_notifications_api()
    
    print("\n⏯️ Testing Continue Watching API...")
    tester.test_continue_watching_api()
    
    print("\n👥 Testing User Profile API...")
    tester.test_user_profile_api()
    
    print("\n📧 Testing Watch Party Invite API...")
    tester.test_watch_party_invite_api()
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"📊 Enhanced Features Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if tester.failed_tests:
        print("\n❌ Failed Tests:")
        for test in tester.failed_tests:
            error_msg = test.get('error', f"Expected {test.get('expected')}, got {test.get('actual')}")
            print(f"   - {test['name']}: {error_msg}")
    
    success_rate = (tester.tests_passed / tester.tests_run) * 100 if tester.tests_run > 0 else 0
    print(f"\n🎯 Success Rate: {success_rate:.1f}%")
    
    if success_rate >= 80:
        print("✅ Enhanced Features API testing completed successfully!")
        return 0
    else:
        print("❌ Enhanced Features API testing failed - too many failures")
        return 1

if __name__ == "__main__":
    sys.exit(main())