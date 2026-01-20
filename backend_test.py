import requests
import sys
import json
from datetime import datetime

class FlixzAPITester:
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
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    if isinstance(response_data, dict) and 'results' in response_data:
                        print(f"   Results count: {len(response_data['results'])}")
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

    def test_health_check(self):
        """Test health endpoint"""
        return self.run_test("Health Check", "GET", "/health", 200)

    def test_tmdb_endpoints(self):
        """Test TMDB movie and TV endpoints"""
        endpoints = [
            ("Trending Movies", "/movies/trending"),
            ("Popular Movies", "/movies/popular"),
            ("Now Playing Movies", "/movies/now-playing"),
            ("Upcoming Movies", "/movies/upcoming"),
            ("Top Rated Movies", "/movies/top-rated"),
            ("Trending TV", "/tv/trending"),
            ("Popular TV", "/tv/popular"),
            ("Airing Today TV", "/tv/airing-today"),
            ("Top Rated TV", "/tv/top-rated"),
        ]
        
        results = []
        for name, endpoint in endpoints:
            success, data = self.run_test(name, "GET", endpoint, 200)
            results.append(success)
        
        return all(results)

    def test_search_functionality(self):
        """Test search endpoints"""
        success, _ = self.run_test("Multi Search", "GET", "/search/multi?query=avengers", 200)
        return success

    def test_movie_details(self):
        """Test movie detail endpoint"""
        # Test with a popular movie ID (Avengers: Endgame)
        success, _ = self.run_test("Movie Details", "GET", "/movies/299536", 200)
        return success

    def test_tv_details(self):
        """Test TV show detail endpoint"""
        # Test with a popular TV show ID (Breaking Bad)
        success, _ = self.run_test("TV Details", "GET", "/tv/1396", 200)
        return success

    def test_genre_endpoints(self):
        """Test genre endpoints"""
        movie_success, _ = self.run_test("Movie Genres", "GET", "/genres/movie", 200)
        tv_success, _ = self.run_test("TV Genres", "GET", "/genres/tv", 200)
        return movie_success and tv_success

    def test_category_endpoints(self):
        """Test category-specific endpoints"""
        endpoints = [
            ("Documentaries", "/category/documentaries"),
            ("Kids Content", "/category/kids"),
            ("Sports Content", "/category/sports"),
        ]
        
        results = []
        for name, endpoint in endpoints:
            success, data = self.run_test(name, "GET", endpoint, 200)
            results.append(success)
        
        return all(results)

    def test_discover_endpoints(self):
        """Test discover endpoints"""
        movie_success, _ = self.run_test("Discover Movies", "GET", "/discover/movie", 200)
        tv_success, _ = self.run_test("Discover TV", "GET", "/discover/tv", 200)
        return movie_success and tv_success

    def test_user_registration(self):
        """Test user registration"""
        timestamp = datetime.now().strftime("%H%M%S")
        test_user = {
            "email": f"test_user_{timestamp}@example.com",
            "password": "TestPass123!",
            "name": f"Test User {timestamp}"
        }
        
        success, response = self.run_test("User Registration", "POST", "/auth/register", 200, test_user)
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_data = response['user']
            print(f"   Registered user: {self.user_data['email']}")
            return True
        return False

    def test_user_login(self):
        """Test user login with registered user"""
        if not self.user_data:
            print("❌ No user data available for login test")
            return False
            
        login_data = {
            "email": self.user_data['email'],
            "password": "TestPass123!"
        }
        
        success, response = self.run_test("User Login", "POST", "/auth/login", 200, login_data)
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            print(f"   Logged in user: {response['user']['email']}")
            return True
        return False

    def test_auth_me(self):
        """Test getting current user info"""
        if not self.token:
            print("❌ No token available for auth test")
            return False
            
        success, response = self.run_test("Get Current User", "GET", "/auth/me", 200)
        return success

    def test_my_list_functionality(self):
        """Test My List CRUD operations"""
        if not self.token:
            print("❌ No token available for My List test")
            return False

        # Test adding to list
        test_item = {
            "media_id": 299536,  # Avengers: Endgame
            "media_type": "movie",
            "title": "Avengers: Endgame",
            "poster_path": "/or06FN3Dka5tukK1e9sl16pB3iy.jpg",
            "backdrop_path": "/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg",
            "vote_average": 8.3
        }
        
        add_success, _ = self.run_test("Add to My List", "POST", "/my-list", 200, test_item)
        
        if not add_success:
            return False

        # Test getting list
        get_success, _ = self.run_test("Get My List", "GET", "/my-list", 200)
        
        if not get_success:
            return False

        # Test checking if item is in list
        check_success, _ = self.run_test("Check in My List", "GET", "/my-list/check/movie/299536", 200)
        
        if not check_success:
            return False

        # Test removing from list
        remove_success, _ = self.run_test("Remove from My List", "DELETE", "/my-list/movie/299536", 200)
        
        return remove_success

    def test_watch_party_functionality(self):
        """Test Watch Party CRUD operations"""
        if not self.token:
            print("❌ No token available for Watch Party test")
            return False

        # Test creating watch party
        party_data = {
            "name": "Test Movie Night",
            "movie_id": 299536,
            "media_type": "movie"
        }
        
        create_success, response = self.run_test("Create Watch Party", "POST", "/watch-party", 200, party_data)
        
        if not create_success or 'room_id' not in response:
            return False
            
        room_id = response['room_id']
        print(f"   Created room: {room_id}")

        # Test getting watch party
        get_success, _ = self.run_test("Get Watch Party", "GET", f"/watch-party/{room_id}", 200)
        
        if not get_success:
            return False

        # Test joining watch party
        join_success, _ = self.run_test("Join Watch Party", "POST", f"/watch-party/{room_id}/join", 200)
        
        if not join_success:
            return False

        # Test listing watch parties
        list_success, _ = self.run_test("List Watch Parties", "GET", "/watch-party", 200)
        
        if not list_success:
            return False

        # Test deleting watch party
        delete_success, _ = self.run_test("Delete Watch Party", "DELETE", f"/watch-party/{room_id}", 200)
        
        return delete_success

def main():
    print("🎬 Starting Flixz API Testing...")
    print("=" * 50)
    
    tester = FlixzAPITester()
    
    # Test basic endpoints first
    print("\n📡 Testing Basic Endpoints...")
    tester.test_health_check()
    
    print("\n🎭 Testing TMDB Integration...")
    tmdb_success = tester.test_tmdb_endpoints()
    
    print("\n🔍 Testing Search & Discovery...")
    tester.test_search_functionality()
    tester.test_movie_details()
    tester.test_tv_details()
    tester.test_genre_endpoints()
    tester.test_category_endpoints()
    tester.test_discover_endpoints()
    
    print("\n👤 Testing Authentication...")
    auth_success = tester.test_user_registration()
    if auth_success:
        tester.test_user_login()
        tester.test_auth_me()
        
        print("\n📝 Testing My List Features...")
        tester.test_my_list_functionality()
        
        print("\n🎉 Testing Watch Party Features...")
        tester.test_watch_party_functionality()
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if tester.failed_tests:
        print("\n❌ Failed Tests:")
        for test in tester.failed_tests:
            error_msg = test.get('error', f"Expected {test.get('expected')}, got {test.get('actual')}")
            print(f"   - {test['name']}: {error_msg}")
    
    success_rate = (tester.tests_passed / tester.tests_run) * 100 if tester.tests_run > 0 else 0
    print(f"\n🎯 Success Rate: {success_rate:.1f}%")
    
    if success_rate >= 80:
        print("✅ Backend API testing completed successfully!")
        return 0
    else:
        print("❌ Backend API testing failed - too many failures")
        return 1

if __name__ == "__main__":
    sys.exit(main())