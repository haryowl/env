const fetch = require('node-fetch');

const testUserCreation = async () => {
  try {
    // Test with the exact data from the image
    const testData = {
      username: 'devo',
      email: 'devowsss@gmail.com',
      password: 'testpassword123', // Make sure it's at least 8 characters
      role: 'manager2'
    };

    console.log('Testing user creation with data:', testData);

    const response = await fetch('http://109.123.255.169:3000/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_TOKEN_HERE' // Replace with actual token
      },
      body: JSON.stringify(testData)
    });

    const result = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(result, null, 2));

    if (!response.ok) {
      console.log('Error details:', result);
      if (result.details) {
        console.log('Validation details:');
        result.details.forEach(detail => {
          console.log(`- ${detail.path.join('.')}: ${detail.message}`);
        });
      }
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
};

testUserCreation(); 