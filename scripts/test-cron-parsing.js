// Test script to verify cron expression parsing
const parseCronExpression = (cronExpr, frequency) => {
  if (!cronExpr) return {};
  
  const parts = cronExpr.split(' ');
  if (parts.length !== 5) return {};
  
  const [minutes, hours, dayOfMonth, month, dayOfWeek] = parts;
  
  const timeFields = {};
  
  // Extract time
  const timeStr = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
  
  switch (frequency) {
    case 'daily':
      timeFields.daily_time = timeStr;
      break;
    case 'weekly':
      timeFields.weekly_time = timeStr;
      // Convert day of week (0=Sunday, 1=Monday, etc.)
      const dayMap = { '0': 'sunday', '1': 'monday', '2': 'tuesday', '3': 'wednesday', '4': 'thursday', '5': 'friday', '6': 'saturday' };
      timeFields.weekly_day = dayMap[dayOfWeek] || 'monday';
      break;
    case 'monthly':
      timeFields.monthly_time = timeStr;
      timeFields.monthly_date = parseInt(dayOfMonth) || 1;
      break;
  }
  
  return timeFields;
};

// Test cases
const testCases = [
  { cron: '0 8 * * *', frequency: 'daily', expected: { daily_time: '08:00' } },
  { cron: '30 14 * * *', frequency: 'daily', expected: { daily_time: '14:30' } },
  { cron: '0 8 * * 1', frequency: 'weekly', expected: { weekly_time: '08:00', weekly_day: 'monday' } },
  { cron: '30 14 * * 5', frequency: 'weekly', expected: { weekly_time: '14:30', weekly_day: 'friday' } },
  { cron: '0 8 1 * *', frequency: 'monthly', expected: { monthly_time: '08:00', monthly_date: 1 } },
  { cron: '30 14 15 * *', frequency: 'monthly', expected: { monthly_time: '14:30', monthly_date: 15 } }
];

console.log('🧪 Testing cron expression parsing...\n');

testCases.forEach((testCase, index) => {
  const result = parseCronExpression(testCase.cron, testCase.frequency);
  const passed = JSON.stringify(result) === JSON.stringify(testCase.expected);
  
  console.log(`Test ${index + 1}: ${passed ? '✅' : '❌'}`);
  console.log(`  Cron: ${testCase.cron}`);
  console.log(`  Frequency: ${testCase.frequency}`);
  console.log(`  Expected: ${JSON.stringify(testCase.expected)}`);
  console.log(`  Got: ${JSON.stringify(result)}`);
  console.log('');
});

console.log('🎉 Cron parsing test completed!');


