export const colors = {
    deepBlue: '#4338CA',
    accentRed: '#DC2626',
    black: '#000000',
    nearBlack: '#0A0A0B',
    darkGray: '#18181B',
    mediumGray: '#52525B',
    lightGray: '#A1A1AA',
    paleGray: '#F4F4F5',
    offWhite: '#FAFAFA',
    white: '#FFFFFF',
    gradient: 'linear-gradient(135deg, #4338CA 0%, #DC2626 100%)'
  };
  
  // Sample data for now - will be replaced with AI-generated content
  export const sampleMealPlan = [
    {
      day: 'Monday',
      meals: [
        { 
          name: 'Greek Yogurt Bowl', 
          type: 'Breakfast', 
          calories: 320, 
          nutrients: 'High in protein and probiotics'
        },
        { 
          name: 'Quinoa Salad', 
          type: 'Lunch', 
          calories: 450, 
          nutrients: 'Rich in fiber and complete proteins'
        },
        { 
          name: 'Grilled Salmon', 
          type: 'Dinner', 
          calories: 380, 
          nutrients: 'Omega-3 fatty acids'
        }
      ]
    }
  ];
  
  export const sampleWorkoutPlan = [
    { 
      day: 'Monday', 
      workout: 'Upper Body Strength', 
      duration: '45 min', 
      focus: 'Chest, shoulders, triceps'
    },
    { 
      day: 'Tuesday', 
      workout: 'Cardio HIIT', 
      duration: '30 min', 
      focus: 'Fat burning and endurance'
    }
  ];
  
  export const subscriptionPlans = [
    {
      id: 1,
      name: 'Essential',
      price: 5.99,
      features: ['Grocery list', 'Gym recommendations', 'Running paths', 'Progress tracking'],
      bgColor: '#4338CA'
    },
    {
      id: 2,
      name: 'Premium',
      price: 9.99,
      features: ['All Essential features', 'Restaurant ordering with macros', 'Delivery links', 'Workout adjustments'],
      bgColor: 'linear-gradient(135deg, #4338CA 0%, #DC2626 100%)',
      popular: true
    },
    {
      id: 3,
      name: 'Pro',
      price: 14.99,
      features: ['All Premium features', 'Photo meal tracking', 'Daily adjustments', 'Weather-based plans'],
      bgColor: '#DC2626'
    }
  ];