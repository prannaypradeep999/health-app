# HealthFit Loop - Claude Code Context

## 📋 App Overview
HealthFit Loop is a comprehensive health and fitness application that generates personalized meal plans and workout routines based on user goals, preferences, and location. The app uses AI to create customized nutrition and fitness plans with real restaurant options and home-cooked alternatives.

## 🏗️ Architecture
- **Frontend**: Next.js 15 with TypeScript, Tailwind CSS, Shadcn/ui components
- **Backend**: Next.js API routes with Prisma ORM
- **Database**: PostgreSQL (Neon hosted)
- **AI Integration**: OpenAI GPT-4o/GPT-4o-mini for meal and workout generation
- **External APIs**: Tavily (web scraping), Google Places, Pexels (images)

## 🔑 Key Features
1. **User Survey**: Captures health goals, dietary preferences, location, budget
2. **Meal Generation**: Creates 4-day meal plans with restaurant + home options
3. **Workout Generation**: Generates personalized workout routines with exercise images
4. **Nutrition Tracking**: Real-time macro tracking with checkboxes for consumed meals
5. **Restaurant Integration**: Real restaurant menus with ordering links (DoorDash, etc.)

## 📁 Critical Frontend Files

### Main Components
- **`src/components/dashboard/DashboardContainer.tsx`**: Main dashboard wrapper
- **`src/components/dashboard/DashboardHome.tsx`**: Dashboard home with meal/workout cards
- **`src/components/dashboard/MealPlanPage.tsx`**: ⭐ **MOST IMPORTANT** - Complete meal plan UI with nutrition tracking
- **`src/components/dashboard/WorkoutPlanPage.tsx`**: Workout plan display
- **`src/components/dashboard/modals/MealPlanModal.tsx`**: Meal generation modal

### Key UI Features in MealPlanPage.tsx
- Day selector (4-day meal plan)
- Nutrition progress bars (calories, protein with color coding)
- Individual checkboxes for ALL meal options (primary + alternatives)
- Real-time macro tracking that updates based on checked meals
- Restaurant ordering integration
- Recipe generation for home meals

## 🔧 Critical Backend Routes

### Meal Generation System
- **`src/app/api/ai/meals/generate/route.ts`**: ⭐ **CORE MEAL GENERATION**
  - 5-step process: Restaurant discovery → Menu extraction → Home meal generation → Merging → Database save
  - Uses Tavily API for web scraping full restaurant menus (not just search snippets)
  - Enhanced with variety enforcement (zero duplicate cuisines/proteins)
  - Mandatory nutrition data (calories, protein, carbs, fat) for all options

- **`src/app/api/ai/meals/current/route.ts`**: Fetches current meal plan with nutrition targets

### Workout Generation
- **`src/app/api/ai/workouts/generate/route.ts`**: Generates personalized workouts
- **`src/app/api/ai/workouts/current/route.ts`**: Fetches current workout plan

### Analysis Routes
- **`src/app/api/ai/analyze-workout/route.ts`**: Workout analysis functionality

## 🗃️ Database Schema (Prisma)
Key models in `prisma/schema.prisma`:
- **User**: User accounts and preferences
- **SurveyResponse**: User goals, preferences, location data
- **MealPlan**: Generated meal plans with JSON meal data
- **WorkoutPlan**: Generated workout routines
- **MealConsumptionLog**: Tracking of consumed meals
- **RestaurantCache/MenuCache**: Cached restaurant data

## 🔄 Recent Major Improvements

### Enhanced Meal Generation (Latest Updates)
1. **Tavily Extract Integration**: Now extracts full webpage content instead of search snippets
2. **Variety Enforcement**: Strict zero-duplicate rules for cuisines, proteins, cooking methods
3. **Complete Nutrition Data**: All meal options must include calories, protein, carbs, fat
4. **Increased Options**: 7-10 restaurant meals + 12-15 home meals per generation

### Advanced Nutrition Tracking
1. **Individual Meal Checkboxes**: Every meal option (primary + alternatives) has "eaten" checkbox
2. **Real-time Tracking**: Progress bars update as users check off consumed meals
3. **Day-specific Tracking**: Separate nutrition tracking for each day of the week
4. **Complete Macro Display**: Shows protein, carbs, fat alongside calories
5. **Smart Calculations**: Only counts nutrition from actually consumed (checked) meals

### UI Improvements
- Rounded nutrition targets (~200g protein vs exact numbers)
- Color-coded progress bars (green/orange/red based on goals)
- Enhanced meal cards with complete nutrition info
- Mobile-responsive design

## 🔧 Development Setup
```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

## 🔑 Environment Variables
- `DATABASE_URL`: Neon PostgreSQL connection
- `GPT_KEY`: OpenAI API key
- `TAVILY_API_KEY`: Tavily web scraping API
- `GOOGLE_PLACES`: Google Places API
- `PEXELS_API_KEY`: Image search API

## 🎯 Current State & Priorities
The app is in an advanced state with sophisticated meal generation and tracking. The meal system uses AI to create personalized plans with real restaurant options and comprehensive nutrition tracking. Recent focus has been on improving meal variety, nutrition accuracy, and user tracking capabilities.

Key areas for continued development:
- Meal plan personalization based on consumption history
- Enhanced restaurant menu accuracy
- Workout progression tracking
- User preference learning

## 📱 User Flow
1. Complete health/fitness survey
2. Generate personalized meal + workout plans
3. Navigate daily meal options with nutrition tracking
4. Check off consumed meals for progress tracking
5. Regenerate plans as needed

The app successfully combines AI-generated recommendations with real-world restaurant integration and detailed nutrition tracking.