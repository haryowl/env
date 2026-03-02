/**
 * Math Formula Service for Device Mapper
 * Safely evaluates mathematical formulas for data transformation
 */

class MathFormulaService {
  constructor() {
    // Allowed functions and operations for security
    this.allowedFunctions = {
      // Math functions
      'Math.abs': Math.abs,
      'Math.ceil': Math.ceil,
      'Math.floor': Math.floor,
      'Math.round': Math.round,
      'Math.max': Math.max,
      'Math.min': Math.min,
      'Math.pow': Math.pow,
      'Math.sqrt': Math.sqrt,
      'Math.log': Math.log,
      'Math.log10': Math.log10,
      'Math.exp': Math.exp,
      'Math.sin': Math.sin,
      'Math.cos': Math.cos,
      'Math.tan': Math.tan,
      'Math.asin': Math.asin,
      'Math.acos': Math.acos,
      'Math.atan': Math.atan,
      'Math.atan2': Math.atan2,
      
      // Constants
      'Math.PI': Math.PI,
      'Math.E': Math.E,
      
      // Utility functions
      'parseFloat': parseFloat,
      'parseInt': parseInt,
      'Number': Number,
      'String': String,
      'Boolean': Boolean,
      
      // Array functions
      'Array': Array,
      'Array.isArray': Array.isArray,
      
      // String functions
      'String.prototype.toLowerCase': String.prototype.toLowerCase,
      'String.prototype.toUpperCase': String.prototype.toUpperCase,
      'String.prototype.trim': String.prototype.trim,
      'String.prototype.replace': String.prototype.replace,
      'String.prototype.split': String.prototype.split,
      'String.prototype.substring': String.prototype.substring,
      'String.prototype.substr': String.prototype.substr,
      'String.prototype.indexOf': String.prototype.indexOf,
      'String.prototype.lastIndexOf': String.prototype.lastIndexOf,
      'String.prototype.includes': String.prototype.includes,
      'String.prototype.startsWith': String.prototype.startsWith,
      'String.prototype.endsWith': String.prototype.endsWith,
      
      // Date functions
      'Date': Date,
      'Date.now': Date.now,
      'Date.parse': Date.parse,
      'Date.UTC': Date.UTC,
      
      // JSON functions
      'JSON.parse': JSON.parse,
      'JSON.stringify': JSON.stringify,
      
      // Global functions
      'isNaN': isNaN,
      'isFinite': isFinite,
      'encodeURI': encodeURI,
      'encodeURIComponent': encodeURIComponent,
      'decodeURI': decodeURI,
      'decodeURIComponent': decodeURIComponent,
      'escape': escape,
      'unescape': unescape
    };
  }

  /**
   * Safely evaluate a math formula
   * @param {string} formula - The formula to evaluate
   * @param {object} context - Context variables (like 'value')
   * @returns {any} - The result of the formula
   */
  evaluateFormula(formula, context = {}) {
    try {
      if (!formula || typeof formula !== 'string') {
        return context.value || context;
      }

      // Clean the formula
      const cleanFormula = formula.trim();
      if (!cleanFormula) {
        return context.value || context;
      }

      // Create a safe evaluation function
      const safeEval = this.createSafeEval(cleanFormula);
      
      // Execute the formula with the value
      const result = safeEval(context.value);
      
      return result;
    } catch (error) {
      console.error('Formula evaluation error:', error);
      throw new Error(`Formula evaluation failed: ${error.message}`);
    }
  }

  /**
   * Create a safe evaluation function
   * @param {string} formula - The formula to make safe
   * @returns {Function} - Safe evaluation function
   */
  createSafeEval(formula) {
    try {
      // Create a simple function that takes the value and evaluates the formula
      const functionBody = `
        "use strict";
        const value = arguments[0];
        
        // Available Math functions
        const abs = Math.abs;
        const ceil = Math.ceil;
        const floor = Math.floor;
        const round = Math.round;
        const max = Math.max;
        const min = Math.min;
        const pow = Math.pow;
        const sqrt = Math.sqrt;
        const log = Math.log;
        const log10 = Math.log10;
        const exp = Math.exp;
        const sin = Math.sin;
        const cos = Math.cos;
        const tan = Math.tan;
        const asin = Math.asin;
        const acos = Math.acos;
        const atan = Math.atan;
        const atan2 = Math.atan2;
        
        // Constants
        const PI = Math.PI;
        const E = Math.E;
        
        // Utility functions
        const parseFloat = global.parseFloat;
        const parseInt = global.parseInt;
        const Number = global.Number;
        const String = global.String;
        const Boolean = global.Boolean;
        const isNaN = global.isNaN;
        const isFinite = global.isFinite;
        
        // Return the evaluated formula
        return (${formula});
      `;

      // Create the function
      return new Function(functionBody);
    } catch (error) {
      throw new Error(`Invalid formula syntax: ${error.message}`);
    }
  }

  /**
   * Validate a formula without executing it
   * @param {string} formula - The formula to validate
   * @returns {object} - Validation result
   */
  validateFormula(formula) {
    try {
      if (!formula || typeof formula !== 'string') {
        return { valid: true, message: 'No formula provided' };
      }

      const cleanFormula = formula.trim();
      if (!cleanFormula) {
        return { valid: true, message: 'Empty formula' };
      }

      // Test with sample data
      const testContext = { value: 10 };
      this.evaluateFormula(cleanFormula, testContext);
      
      return { valid: true, message: 'Formula is valid' };
    } catch (error) {
      return { 
        valid: false, 
        message: `Formula validation failed: ${error.message}` 
      };
    }
  }

  /**
   * Get available functions and examples
   * @returns {object} - Available functions and examples
   */
  getAvailableFunctions() {
    return {
      functions: Object.keys(this.allowedFunctions),
      examples: [
        'value * 2',
        'value / 1000',
        'Math.round(value)',
        'Math.floor(value)',
        'Math.ceil(value)',
        'value * Math.PI / 180', // Convert degrees to radians
        'value * 180 / Math.PI', // Convert radians to degrees
        'Math.pow(value, 2)', // Square
        'Math.sqrt(value)', // Square root
        'value > 0 ? value : 0', // Ensure positive
        'value < 100 ? value : 100', // Cap at 100
        'parseFloat(value).toFixed(2)', // Format to 2 decimal places',
        'String(value).toUpperCase()', // Convert to uppercase',
        'value.toString().replace(".", ",")', // Replace decimal separator'
      ]
    };
  }
}

module.exports = new MathFormulaService(); 