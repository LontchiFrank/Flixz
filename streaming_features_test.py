import requests
import sys
import json
import io
from datetime import datetime

class StreamingFeaturesAPITester:
    def __init__(self, base_url="https://watchparty-72.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.user_data = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.uploaded_content_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, files=None):
        """Run a single API test"""
        url = f"{self.api_url}{endpoint}"
        test_headers = {}
        
        if headers:
            test_headers.update(headers)
        
        # Only add Content-Type for JSON requests
        if not files and data:
            test_headers['Content-Type'] = 'application/json'
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=30)
            elif method == 'POST':
                if files:
                    # For multipart form data, don't set Content-Type header
                    response = requests.post(url, data=data, files=files, headers={k: v for k, v in test_headers.items() if k != 'Content-Type'}, timeout=60)
                else:
                    response = requests.post(url, json=data, headers=test_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=30)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    if isinstance(response_data, dict):
                        if 'results' in response_data:
                            print(f"   Results count: {len(response_data['results'])}")
                        elif 'content_id' in response_data:
                            print(f"   Content ID: {response_data['content_id']}")
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
            "email": f"streaming_test_{timestamp}@example.com",
            "password": "TestPass123!",
            "name": f"Streaming Test User {timestamp}"
        }
        
        success, response = self.run_test("User Registration", "POST", "/auth/register", 200, test_user)
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_data = response['user']
            print(f"   Registered user: {self.user_data['email']}")
            return True
        return False

    def test_custom_content_list_empty(self):
        """Test getting custom content list (should be empty initially)"""
        success, response = self.run_test("List Custom Content (Empty)", "GET", "/custom-content", 200)
        
        if success and 'results' in response:
            print(f"   Found {len(response['results'])} existing content items")
            return True
        return success

    def test_custom_content_upload(self):
        """Test uploading custom content with multipart form data"""
        if not self.token:
            print("❌ No token available for upload test")
            return False

        # Create a small test video file (fake MP4 content)
        fake_video_content = b'\x00\x00\x00\x20ftypmp41\x00\x00\x00\x00mp41isom\x00\x00\x00\x08free'
        video_file = io.BytesIO(fake_video_content)
        
        # Create a small test image file (fake PNG content)
        fake_image_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\tpHYs\x00\x00\x0b\x13\x00\x00\x0b\x13\x01\x00\x9a\x9c\x18\x00\x00\x00\nIDATx\x9cc\xf8\x00\x00\x00\x01\x00\x01\x00\x00\x00\x00IEND\xaeB`\x82'
        poster_file = io.BytesIO(fake_image_content)

        # Prepare form data
        form_data = {
            'title': 'Test Movie Upload',
            'description': 'This is a test movie uploaded via API',
            'media_type': 'movie',
            'genre': 'Action',
            'year': '2024'
        }

        files = {
            'video': ('test_video.mp4', video_file, 'video/mp4'),
            'poster': ('test_poster.png', poster_file, 'image/png')
        }

        success, response = self.run_test("Upload Custom Content", "POST", "/custom-content/upload", 200, form_data, files=files)
        
        if success and 'content_id' in response:
            self.uploaded_content_id = response['content_id']
            print(f"   Uploaded content ID: {self.uploaded_content_id}")
            return True
        return success

    def test_custom_content_list_with_content(self):
        """Test getting custom content list after upload"""
        success, response = self.run_test("List Custom Content (With Content)", "GET", "/custom-content", 200)
        
        if success and 'results' in response:
            content_list = response['results']
            print(f"   Found {len(content_list)} content items")
            if len(content_list) > 0:
                print(f"   First item: {content_list[0].get('title', 'No title')}")
            return True
        return success

    def test_custom_content_get_specific(self):
        """Test getting specific custom content details"""
        if not self.uploaded_content_id:
            print("❌ No uploaded content ID available")
            return False

        success, response = self.run_test("Get Specific Custom Content", "GET", f"/custom-content/{self.uploaded_content_id}", 200)
        
        if success:
            print(f"   Content title: {response.get('title', 'No title')}")
            print(f"   Content type: {response.get('media_type', 'No type')}")
            print(f"   Views: {response.get('views', 0)}")
            return True
        return success

    def test_custom_content_delete(self):
        """Test deleting custom content"""
        if not self.uploaded_content_id:
            print("❌ No uploaded content ID available")
            return False

        success, response = self.run_test("Delete Custom Content", "DELETE", f"/custom-content/{self.uploaded_content_id}", 200)
        return success

    def test_movie_details_for_watch_page(self):
        """Test getting movie details for the watch page (movie ID 872585)"""
        success, response = self.run_test("Movie Details for Watch Page", "GET", "/movies/872585", 200)
        
        if success:
            print(f"   Movie title: {response.get('title', 'No title')}")
            print(f"   Release date: {response.get('release_date', 'No date')}")
            return True
        return success

    def test_health_check(self):
        """Test health endpoint"""
        return self.run_test("Health Check", "GET", "/health", 200)[0]

def main():
    print("🎬 Starting Streaming Features API Testing...")
    print("=" * 60)
    
    tester = StreamingFeaturesAPITester()
    
    # Test basic health check
    print("\n📡 Testing Basic Health Check...")
    tester.test_health_check()
    
    # Setup test user
    print("\n👤 Setting up Test User...")
    auth_success = tester.setup_test_user()
    
    if not auth_success:
        print("❌ Failed to setup test user - cannot continue with authenticated tests")
        return 1
    
    # Test movie details for watch page
    print("\n🎭 Testing Movie Details for Watch Page...")
    tester.test_movie_details_for_watch_page()
    
    # Test custom content functionality
    print("\n📹 Testing Custom Content Upload Functionality...")
    tester.test_custom_content_list_empty()
    
    upload_success = tester.test_custom_content_upload()
    if upload_success:
        tester.test_custom_content_list_with_content()
        tester.test_custom_content_get_specific()
        tester.test_custom_content_delete()
    else:
        print("❌ Upload failed - skipping dependent tests")
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if tester.failed_tests:
        print("\n❌ Failed Tests:")
        for test in tester.failed_tests:
            error_msg = test.get('error', f"Expected {test.get('expected')}, got {test.get('actual')}")
            print(f"   - {test['name']}: {error_msg}")
    
    success_rate = (tester.tests_passed / tester.tests_run) * 100 if tester.tests_run > 0 else 0
    print(f"\n🎯 Success Rate: {success_rate:.1f}%")
    
    if success_rate >= 80:
        print("✅ Streaming Features API testing completed successfully!")
        return 0
    else:
        print("❌ Streaming Features API testing failed - too many failures")
        return 1

if __name__ == "__main__":
    sys.exit(main())