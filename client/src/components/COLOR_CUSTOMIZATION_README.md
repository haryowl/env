# Color Customization System

## Overview
The IoT Monitoring System now includes a comprehensive color customization system that allows users to personalize the appearance of the KIMA Professional theme safely and easily.

## Features

### 🎨 **Color Customization Options**
- **Sidebar Color**: Customize the main navigation sidebar color
- **Accent Color**: Set the accent color for buttons, highlights, and interactive elements
- **Background Color**: Choose the main page background color
- **Card Background Color**: Customize the background color of content cards
- **Text Color**: Set the primary text color for optimal readability

### 🌙 **Dark Mode Support**
- Toggle between light and dark modes
- Automatic color adjustments for better contrast
- Separate color presets for dark mode

### 🎯 **Predefined Color Presets**
- **KIMA Professional**: Original purple and orange theme
- **Ocean Blue**: Blue and orange combination
- **Forest Green**: Green and red combination
- **Sunset Orange**: Orange and purple combination
- **Midnight Purple**: Dark purple theme
- **Rose Gold**: Pink and gold combination
- **Dark Professional**: Dark mode variant
- **Dark Purple**: Dark purple variant
- **Dark Blue**: Dark blue variant

## How to Use

### Method 1: Settings Page
1. Navigate to **Settings** → **Appearance**
2. Select **KIMA Professional** theme
3. The **Color Customization** section will appear
4. Use the color pickers to customize colors
5. Changes are applied instantly

### Method 2: Color Customizer Page
1. Navigate to **Data** → **Color Customizer**
2. Choose from predefined presets or create custom colors
3. Use the color picker controls for fine-tuning
4. Preview your changes in real-time

### Method 3: Quick Preset Selection
1. In the Color Customizer, click on any preset card
2. Colors are applied immediately
3. Presets are automatically saved

## Technical Implementation

### Safe Theme Switching
- Colors are stored in `localStorage` as `kima_custom_colors`
- Theme switching is completely safe - no data loss
- Easy rollback to default colors
- All existing functionality preserved

### Dynamic Theme Generation
- Colors are applied using Material-UI's theming system
- Automatic contrast calculation for text readability
- Responsive color adjustments for different UI elements
- Real-time theme updates without page refresh

### Color Storage
```javascript
// Colors are stored in localStorage as:
{
  "sidebar": "#007BA7",
  "accent": "#F59E0B", 
  "background": "#F8FAFC",
  "card": "#FFFFFF",
  "text": "#1F2937",
  "isDarkMode": false
}
```

## Color Guidelines

### Recommended Color Combinations
- **High Contrast**: Use dark text on light backgrounds
- **Accessibility**: Ensure sufficient contrast ratios
- **Consistency**: Keep accent colors consistent throughout
- **Readability**: Test text readability with chosen colors

### Best Practices
- Use the color picker for precise color selection
- Test both light and dark modes
- Consider color psychology for different use cases
- Save frequently used combinations as presets

## Troubleshooting

### Colors Not Applying
1. Ensure you're using the KIMA Professional theme
2. Check if colors are saved in localStorage
3. Try refreshing the page
4. Reset to default colors and try again

### Poor Contrast
1. Use the dark mode toggle for better contrast
2. Adjust text color for better readability
3. Try different background/card color combinations

### Performance Issues
1. Avoid too many rapid color changes
2. Use predefined presets for better performance
3. Clear localStorage if needed: `localStorage.removeItem('kima_custom_colors')`

## Future Enhancements
- Color scheme import/export
- Advanced color palette tools
- Accessibility compliance checking
- Color scheme sharing between users
- More predefined presets
- Gradient color support

## Support
For issues or suggestions regarding color customization, please contact the development team or create an issue in the project repository.





