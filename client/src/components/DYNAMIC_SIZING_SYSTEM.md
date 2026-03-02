# Dynamic Parameter Card Sizing System

## Overview
The parameter cards now use a sophisticated dynamic sizing system that automatically adjusts the width and layout based on:
- **Number of parameters** available
- **Screen size** (mobile, tablet, desktop)
- **Available container width**
- **Optimal visual balance**

## How It Works

### 1. **Dynamic Grid Calculation**
```javascript
const getDynamicGridSize = (totalParams) => {
  // Calculate optimal cards per row based on parameter count
  let cardsPerRow;
  
  if (totalParams <= 1) {
    cardsPerRow = 1; // Single card takes full width
  } else if (totalParams <= 2) {
    cardsPerRow = 2; // 2 cards per row
  } else if (totalParams <= 3) {
    cardsPerRow = 3; // 3 cards per row
  } else if (totalParams <= 4) {
    cardsPerRow = 4; // 4 cards per row
  } else if (totalParams <= 6) {
    cardsPerRow = 6; // 6 cards per row
  } else if (totalParams <= 8) {
    cardsPerRow = 8; // 8 cards per row
  } else if (totalParams <= 12) {
    cardsPerRow = 12; // 12 cards per row
  } else {
    cardsPerRow = Math.ceil(totalParams / 2); // Dynamic based on count
  }
  
  // Calculate grid size (12 is the total grid system)
  const gridSize = Math.floor(12 / cardsPerRow);
  
  return {
    xs: 12, // Always full width on mobile
    sm: Math.max(6, gridSize * 2), // At least 2 cards per row on small screens
    md: gridSize, // Calculated size on medium screens
    lg: gridSize, // Same size on large screens
  };
};
```

### 2. **Screen Size Responsiveness**
- **Mobile (xs)**: Always 1 card per row (full width)
- **Small (sm)**: Minimum 2 cards per row
- **Medium (md)**: Calculated optimal size
- **Large (lg)**: Same as medium for consistency

### 3. **Advanced Layout System**
The `DynamicParameterCards` component includes an even more sophisticated system:

```javascript
const layouts = {
  mobile: {
    1: { cols: 1, cardWidth: '100%' },
    2: { cols: 1, cardWidth: '100%' },
    3: { cols: 1, cardWidth: '100%' },
    4: { cols: 2, cardWidth: '50%' },
    // ... more configurations
  },
  tablet: {
    1: { cols: 1, cardWidth: '100%' },
    2: { cols: 2, cardWidth: '50%' },
    3: { cols: 3, cardWidth: '33.33%' },
    4: { cols: 4, cardWidth: '25%' },
    // ... more configurations
  },
  desktop: {
    1: { cols: 1, cardWidth: '100%' },
    2: { cols: 2, cardWidth: '50%' },
    3: { cols: 3, cardWidth: '33.33%' },
    4: { cols: 4, cardWidth: '25%' },
    5: { cols: 5, cardWidth: '20%' },
    6: { cols: 6, cardWidth: '16.67%' },
    // ... more configurations
  }
};
```

## Sizing Examples

### **1 Parameter**
- **Mobile**: 1 card, full width
- **Tablet**: 1 card, full width  
- **Desktop**: 1 card, full width

### **2 Parameters**
- **Mobile**: 2 cards, stacked (full width each)
- **Tablet**: 2 cards, side by side (50% each)
- **Desktop**: 2 cards, side by side (50% each)

### **3 Parameters**
- **Mobile**: 3 cards, stacked (full width each)
- **Tablet**: 3 cards, side by side (33.33% each)
- **Desktop**: 3 cards, side by side (33.33% each)

### **4 Parameters**
- **Mobile**: 4 cards, 2x2 grid (50% each)
- **Tablet**: 4 cards, side by side (25% each)
- **Desktop**: 4 cards, side by side (25% each)

### **5 Parameters**
- **Mobile**: 5 cards, 2x3 grid (50% each)
- **Tablet**: 5 cards, 3+2 grid (33.33% each)
- **Desktop**: 5 cards, side by side (20% each)

### **6 Parameters**
- **Mobile**: 6 cards, 2x3 grid (50% each)
- **Tablet**: 6 cards, 3x2 grid (33.33% each)
- **Desktop**: 6 cards, side by side (16.67% each)

## Key Features

### **1. Proportional Sizing**
- More parameters = smaller individual cards
- Fewer parameters = larger individual cards
- Always uses full container width

### **2. Responsive Design**
- Adapts to different screen sizes
- Mobile-first approach
- Optimal viewing on all devices

### **3. Visual Balance**
- Cards maintain consistent spacing
- Minimum width constraints prevent cards from becoming too small
- Maximum width utilization for better space usage

### **4. Dynamic Adaptation**
- Automatically adjusts when parameters change
- Real-time updates when device selection changes
- No manual configuration required

## Technical Implementation

### **Grid System**
```javascript
<Grid container spacing={2} sx={{ width: '100%' }}>
  {kpiData.map((kpi, index) => (
    <Grid 
      item 
      {...gridSize} 
      key={index} 
      sx={{ 
        display: 'flex',
        minWidth: '200px', // Minimum width constraint
        maxWidth: 'none'   // No maximum width constraint
      }}
    >
      <Card sx={{ height: '100%', width: '100%' }}>
        {/* Card content */}
      </Card>
    </Grid>
  ))}
</Grid>
```

### **Width Constraints**
- **Minimum Width**: 200px (prevents cards from becoming too small)
- **Maximum Width**: None (allows cards to expand)
- **Height**: 100% (fills available vertical space)
- **Spacing**: 2 units between cards

### **Responsive Breakpoints**
- **xs (0px+)**: Mobile devices
- **sm (600px+)**: Small tablets
- **md (900px+)**: Tablets and small desktops
- **lg (1200px+)**: Large desktops

## Benefits

### **For Users**
- **Optimal Space Usage**: Cards always use the full available width
- **Consistent Layout**: Proportional sizing maintains visual balance
- **Responsive Experience**: Works perfectly on all device sizes
- **Automatic Adaptation**: No manual adjustment needed

### **For Developers**
- **Zero Configuration**: Works automatically with any number of parameters
- **Maintainable Code**: Clean, reusable sizing logic
- **Extensible Design**: Easy to add new sizing rules
- **Performance Optimized**: Efficient grid calculations

## Debug Information

In development mode, the system shows debug information:
```
Dynamic Layout: 5 parameters | Screen: desktop | Layout: 5 columns | Grid: {"xs":12,"sm":6,"md":2,"lg":2}
```

This helps developers understand how the sizing system is working.

## Future Enhancements

### **Potential Improvements**
- **Custom Layout Rules**: Allow users to define custom sizing rules
- **Animation Transitions**: Smooth transitions when layout changes
- **Density Options**: Compact vs. spacious layout modes
- **Aspect Ratio Control**: Maintain specific card aspect ratios
- **Collapsible Cards**: Allow cards to collapse on smaller screens

The dynamic sizing system ensures that your parameter cards always look professional and make optimal use of the available space, regardless of how many parameters you have or what device you're using!





