#!/usr/bin/env python3
"""
Test Tavily API for restaurant menu extraction
"""

from tavily import TavilyClient
import json

# Initialize client
client = TavilyClient("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")

def test_query(query, search_depth="basic"):
    """Test a Tavily query and print detailed results"""
    print(f"\n{'='*80}")
    print(f"QUERY: {query}")
    print(f"SEARCH DEPTH: {search_depth}")
    print(f"{'='*80}\n")
    
    response = client.search(
        query=query,
        search_depth=search_depth,
        max_results=5
    )
    
    print(f"📊 Results found: {len(response.get('results', []))}\n")
    
    for i, result in enumerate(response.get('results', []), 1):
        print(f"\n--- Result {i} ---")
        print(f"📋 Title: {result.get('title', 'N/A')}")
        print(f"🔗 URL: {result.get('url', 'N/A')}")
        print(f"⭐ Score: {result.get('score', 'N/A')}")
        
        content = result.get('content', '')
        print(f"\n📄 Content ({len(content)} chars):")
        print(content[:500] if len(content) > 500 else content)
        
        if len(content) > 500:
            print(f"\n... (truncated, total {len(content)} chars)")
        
        # Check for menu-related keywords in content
        menu_keywords = ['menu', 'price', '$', 'calories', 'dish', 'appetizer', 'entree']
        found_keywords = [kw for kw in menu_keywords if kw.lower() in content.lower()]
        if found_keywords:
            print(f"\n🔍 Found keywords: {', '.join(found_keywords)}")
        
        print("\n" + "-"*80)
    
    return response

def main():
    restaurant = "The Bite"
    location = "San Francisco"
    zip_code = "94109"
    
    # Test different query strategies
    queries = [
        # Your current approach
        f'"{restaurant}" "{location}" site:doordash.com/store',
        
        # Try PDF menus
        f'{restaurant} {location} menu PDF',
        
        # Try menu aggregator sites
        f'{restaurant} {location} menu allmenus.com',
        f'{restaurant} {location} menu menupages.com',
        
        # Try with more specific location
        f'{restaurant} 996 Mission St San Francisco menu',
        
        # Try multi-platform
        f'"{restaurant}" "{location}" (site:ubereats.com OR site:grubhub.com OR site:doordash.com)',
    ]
    
    print("🔍 Testing Tavily Queries for Restaurant Menu Extraction")
    print(f"🏪 Restaurant: {restaurant}")
    print(f"📍 Location: {location}, {zip_code}")
    
    for query in queries:
        try:
            # Test with basic first
            response = test_query(query, search_depth="basic")
            
            # If you want to test advanced (costs more):
            # response = test_query(query, search_depth="advanced")
            
            # Brief pause between queries
            import time
            time.sleep(1)
            
        except Exception as e:
            print(f"❌ Error with query: {query}")
            print(f"Error: {str(e)}\n")
    
    print("\n" + "="*80)
    print("✅ Testing complete!")
    print("="*80)

if __name__ == "__main__":
    main()
