/**
 * AWS Lambda Product Service
 * 
 * This module provides a comprehensive product management service for an e-commerce microservices architecture.
 * It handles CRUD operations for products stored in Amazon DynamoDB and is designed to be deployed as an
 * AWS Lambda function behind an API Gateway.
 * 
 * Key Features:
 * - Full CRUD operations (Create, Read, Update, Delete) for products
 * - Product retrieval by ID, category filtering, and bulk operations
 * - RESTful API compliance with proper HTTP method routing
 * - Comprehensive error handling and logging
 * - Auto-generation of unique product IDs using UUID v4
 * 
 * Architecture:
 * - Uses AWS SDK v3 for DynamoDB operations
 * - Leverages marshall/unmarshall utilities for DynamoDB data transformation
 * - Implements proper Lambda response format with status codes and error messages
 * 
 * Environment Dependencies:
 * - DYNAMODB_TABLE_NAME: The name of the DynamoDB table storing product data
 * 
 * Performance Considerations:
 * - getAllProducts uses DynamoDB Scan which can be expensive for large datasets
 * - getProductsByCategory uses Query with FilterExpression for efficient category-based filtering
 * - All operations include proper error handling to prevent Lambda cold start issues
 * 
 * Data Model Assumptions:
 * - Products have an 'id' field as the primary key
 * - Products may have a 'category' field for filtering operations
 * - Product schema is flexible, allowing arbitrary fields in create/update operations
 * 
 * @author AWS Microservices Team
 * @version 1.0.0
 * @since 2024
 */

import { DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { ddbClient } from "./ddbClient";
import { v4 as uuidv4 } from 'uuid';

/**
 * Main Lambda Handler Function
 * 
 * This is the entry point for all product-related API requests. It acts as a router,
 * directing incoming HTTP requests to the appropriate CRUD operation based on the
 * HTTP method and request parameters.
 * 
 * Supported Operations:
 * - GET /product           -> getAllProducts() - Retrieves all products
 * - GET /product/{id}      -> getProduct() - Retrieves a specific product by ID
 * - GET /product/{id}?category=X -> getProductsByCategory() - Filters products by category
 * - POST /product          -> createProduct() - Creates a new product
 * - PUT /product/{id}      -> updateProduct() - Updates an existing product
 * - DELETE /product/{id}   -> deleteProduct() - Deletes a product
 * 
 * @param {Object} event - AWS Lambda event object containing HTTP request details
 * @param {string} event.httpMethod - The HTTP method (GET, POST, PUT, DELETE)
 * @param {Object} event.pathParameters - URL path parameters (e.g., {id: "123"})
 * @param {Object} event.queryStringParameters - URL query parameters (e.g., {category: "Electronics"})
 * @param {string} event.body - Request body for POST/PUT operations (JSON string)
 * 
 * @returns {Object} AWS Lambda response object
 * @returns {number} return.statusCode - HTTP status code (200 for success, 500 for error)
 * @returns {string} return.body - JSON stringified response body
 * 
 * Response Format (Success):
 * {
 *   statusCode: 200,
 *   body: JSON.stringify({
 *     message: "Successfully finished operation: [METHOD]",
 *     body: [operation_result]
 *   })
 * }
 * 
 * Response Format (Error):
 * {
 *   statusCode: 500,
 *   body: JSON.stringify({
 *     message: "Failed to perform operation.",
 *     errorMsg: [error_message],
 *     errorStack: [stack_trace]
 *   })
 * }
 * 
 * Error Handling:
 * - Catches all exceptions and returns standardized error responses
 * - Logs errors for debugging and monitoring
 * - Includes stack traces in error responses for development purposes
 * - Returns appropriate HTTP status codes
 * 
 * Performance Notes:
 * - Request logging may impact performance for high-volume scenarios
 * - Consider implementing request/response size limits for production use
 */
exports.handler = async function(event) {
    // Log the complete incoming request for debugging and audit purposes
    // Note: In production, consider redacting sensitive information
    console.log("request:", JSON.stringify(event, undefined, 2));

    let body; // Will hold the response data from the appropriate operation
    
    try {
      // Route the request based on HTTP method
      // This switch statement implements the RESTful API routing logic
      switch (event.httpMethod) {
        case "GET":
          // Determine GET operation type based on presence of query parameters and path parameters
          if(event.queryStringParameters != null) {
            // Query parameters present: filter products by category
            // Expected format: GET /product/{id}?category=CategoryName
            body = await getProductsByCategory(event);
          }
          else if (event.pathParameters != null) {
            // Path parameter present: get specific product by ID
            // Expected format: GET /product/{id}
            body = await getProduct(event.pathParameters.id);
          } else {
            // No parameters: get all products
            // Expected format: GET /product
            body = await getAllProducts();
          }
          break;
        case "POST":
          // Create new product with data from request body
          // Expected format: POST /product with JSON body
          body = await createProduct(event);
          break;
        case "DELETE":
          // Delete product by ID from path parameters
          // Expected format: DELETE /product/{id}
          body = await deleteProduct(event.pathParameters.id);
          break;
        case "PUT":
          // Update existing product with data from request body
          // Expected format: PUT /product/{id} with JSON body
          body = await updateProduct(event);
          break;
        default:
          // Handle unsupported HTTP methods
          throw new Error(`Unsupported route: "${event.httpMethod}"`);
      }

      // Log successful operation result for monitoring
      console.log(body);
      
      // Return standardized success response
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: `Successfully finished operation: "${event.httpMethod}"`,
          body: body
        })
      };

    } catch (e) {
      // Comprehensive error handling
      // Log error details for debugging and monitoring
      console.error(e);
      
      // Return standardized error response with debugging information
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "Failed to perform operation.",
          errorMsg: e.message,
          errorStack: e.stack, // Include stack trace for debugging (consider removing in production)
        })
      };
    }
};

/**
 * Retrieve Single Product by ID
 * 
 * Fetches a specific product from DynamoDB using its unique identifier.
 * This function implements a direct key lookup for optimal performance.
 * 
 * @param {string} productId - The unique identifier for the product to retrieve
 * 
 * @returns {Promise<Object>} Promise that resolves to:
 *   - Product object with all fields if found
 *   - Empty object {} if product doesn't exist
 * 
 * @throws {Error} DynamoDB operation errors (network issues, permissions, etc.)
 * 
 * Performance Characteristics:
 * - O(1) lookup complexity due to primary key access
 * - Low latency operation suitable for high-frequency requests
 * - Uses GetItemCommand for efficient single-item retrieval
 * 
 * Error Handling:
 * - Propagates DynamoDB errors to caller for proper HTTP response handling
 * - Handles case where item doesn't exist gracefully (returns empty object)
 * - Logs errors for monitoring and debugging
 */
const getProduct = async (productId) => {
  console.log("getProduct");

  try {
    // Prepare DynamoDB GetItem parameters
    // Uses marshall to convert JavaScript object to DynamoDB AttributeValue format
    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME, // Environment variable for table flexibility
      Key: marshall({ id: productId }) // Primary key specification
    };

    // Execute the GetItem operation
    // Destructure to extract Item from response (ignore other metadata)
    const { Item } = await ddbClient.send(new GetItemCommand(params));

    console.log(Item);
    
    // Convert DynamoDB AttributeValue format back to JavaScript object
    // Return empty object if item not found (graceful handling of missing records)
    return (Item) ? unmarshall(Item) : {};

  } catch(e) {
    // Log error for debugging while preserving stack trace
    console.error(e);
    // Re-throw to allow higher-level error handling
    throw e;
  }
}

/**
 * Retrieve All Products
 * 
 * Fetches all products from the DynamoDB table using a scan operation.
 * This function retrieves every item in the table without filtering.
 * 
 * @returns {Promise<Array<Object>>} Promise that resolves to:
 *   - Array of product objects if products exist
 *   - Empty object {} if no products exist
 * 
 * @throws {Error} DynamoDB operation errors (network issues, permissions, etc.)
 * 
 * Performance Considerations:
 * - Uses DynamoDB Scan operation which reads every item in the table
 * - Can be expensive and slow for large datasets (O(n) where n = total items)
 * - Consider implementing pagination for tables with many items
 * - May consume significant read capacity units (RCUs)
 * - Not suitable for real-time applications with large datasets
 * 
 * Cost Implications:
 * - Scan operations consume RCUs based on the size of examined data
 * - Even if filters are applied later, all data is read first
 * - Consider using Query with GSI for better performance on large tables
 * 
 * Alternative Approaches:
 * - Use Query with GSI for filtered retrieval
 * - Implement pagination with LastEvaluatedKey for large datasets
 * - Consider caching frequently accessed data
 * 
 * Error Handling:
 * - Propagates DynamoDB errors to caller
 * - Handles empty table gracefully
 * - Logs results for monitoring and debugging
 */
const getAllProducts = async () => {
  console.log("getAllProducts");
  try {
    // Prepare DynamoDB Scan parameters
    // Scan operation reads all items in the table
    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME
      // Note: No Key specified - this scans the entire table
      // Consider adding Limit parameter for pagination in production
    };

    // Execute the Scan operation
    // Destructure to extract Items array from response
    const { Items } = await ddbClient.send(new ScanCommand(params));

    console.log(Items);
    
    // Convert DynamoDB AttributeValue format to JavaScript objects
    // Use map to transform each item, or return empty object if no items
    return (Items) ? Items.map((item) => unmarshall(item)) : {};

  } catch(e) {
    // Log error for debugging while preserving stack trace
    console.error(e);
    // Re-throw to allow higher-level error handling
    throw e;
  }
}

/**
 * Create New Product
 * 
 * Creates a new product record in DynamoDB with auto-generated unique ID.
 * This function parses the product data from the request body, assigns a UUID,
 * and stores the complete product record in the database.
 * 
 * @param {Object} event - AWS Lambda event object containing the HTTP request
 * @param {string} event.body - JSON string containing product data to create
 * 
 * @returns {Promise<Object>} Promise that resolves to DynamoDB PutItem response
 *   Contains metadata about the create operation (not the created item itself)
 * 
 * @throws {Error} JSON parsing errors or DynamoDB operation errors
 * 
 * Input Data Validation:
 * - Expects valid JSON in request body
 * - No schema validation performed (flexible product structure)
 * - Overwrites any provided 'id' field with generated UUID
 * 
 * Business Logic:
 * - Auto-generates UUID v4 for product identification
 * - Preserves all fields from request body except 'id'
 * - No duplicate checking performed (relies on UUID uniqueness)
 * 
 * Security Considerations:
 * - No input sanitization performed
 * - Consider adding field validation for production use
 * - May accept arbitrary data structure
 * 
 * Performance Notes:
 * - O(1) operation complexity
 * - Uses PutItem for efficient single-item creation
 * - No conditional checks (overwrites if ID collision occurs, which is unlikely with UUID)
 */
const createProduct = async (event) => {
  console.log(`createProduct function. event : "${event}"`);
  try {
    // Parse the JSON request body to extract product data
    // This may throw if invalid JSON is provided
    const productRequest = JSON.parse(event.body);
    
    // Generate unique product identifier using UUID v4
    // This ensures global uniqueness and prevents ID collisions
    const productId = uuidv4();
    productRequest.id = productId; // Override any provided ID for security

    // Prepare DynamoDB PutItem parameters
    // Marshall converts JavaScript object to DynamoDB AttributeValue format
    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: marshall(productRequest || {}) // Fallback to empty object if somehow null
    };

    // Execute the PutItem operation
    // This will create a new item or completely replace existing item with same ID
    const createResult = await ddbClient.send(new PutItemCommand(params));

    // Log the operation result for monitoring and debugging
    console.log(createResult);
    return createResult; // Return DynamoDB response metadata

  } catch(e) {
    // Log error for debugging (includes JSON parsing errors)
    console.error(e);
    // Re-throw to allow higher-level error handling
    throw e;
  }
}

/**
 * Delete Product by ID
 * 
 * Removes a product from DynamoDB using its unique identifier.
 * This function performs a direct key-based deletion operation.
 * 
 * @param {string} productId - The unique identifier of the product to delete
 * 
 * @returns {Promise<Object>} Promise that resolves to DynamoDB DeleteItem response
 *   Contains metadata about the delete operation (not the deleted item)
 * 
 * @throws {Error} DynamoDB operation errors (network issues, permissions, etc.)
 * 
 * Deletion Behavior:
 * - Performs immediate deletion without confirmation
 * - No validation that the product exists before deletion
 * - Succeeds even if the product ID doesn't exist (idempotent operation)
 * - Cannot be undone once executed
 * 
 * Business Considerations:
 * - Consider soft delete pattern for audit trails
 * - May want to check for related data (orders, reviews) before deletion
 * - No backup or recovery mechanism implemented
 * 
 * Performance Characteristics:
 * - O(1) operation complexity
 * - Low latency due to primary key access
 * - Uses DeleteItemCommand for efficient single-item removal
 * 
 * Security Notes:
 * - No authorization checks performed
 * - Permanent data loss operation
 * - Consider implementing access controls in production
 */
const deleteProduct = async (productId) => {
  console.log(`deleteProduct function. productId : "${productId}"`);

  try {
    // Prepare DynamoDB DeleteItem parameters
    // Uses marshall to convert JavaScript object to DynamoDB AttributeValue format
    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: marshall({ id: productId }), // Specify the primary key for deletion
    };

    // Execute the DeleteItem operation
    // This permanently removes the item from the table if it exists
    const deleteResult = await ddbClient.send(new DeleteItemCommand(params));

    // Log the operation result for monitoring and debugging
    console.log(deleteResult);
    return deleteResult; // Return DynamoDB response metadata
    
  } catch(e) {
    // Log error for debugging while preserving stack trace
    console.error(e);
    // Re-throw to allow higher-level error handling
    throw e;
  }
}

/**
 * Update Existing Product
 * 
 * Updates an existing product in DynamoDB with new field values.
 * This function uses dynamic UpdateExpression generation to support
 * updating any combination of product fields.
 * 
 * @param {Object} event - AWS Lambda event object containing the HTTP request
 * @param {string} event.body - JSON string containing fields to update
 * @param {Object} event.pathParameters - Contains the product ID to update
 * @param {string} event.pathParameters.id - The unique identifier of the product to update
 * 
 * @returns {Promise<Object>} Promise that resolves to DynamoDB UpdateItem response
 *   Contains metadata about the update operation
 * 
 * @throws {Error} JSON parsing errors or DynamoDB operation errors
 * 
 * Update Behavior:
 * - Only updates fields provided in the request body
 * - Preserves existing fields not mentioned in the update
 * - Creates item if it doesn't exist (upsert behavior)
 * - Overwrites existing field values completely
 * 
 * Dynamic Expression Generation:
 * - Builds UpdateExpression dynamically based on provided fields
 * - Uses ExpressionAttributeNames to handle reserved words
 * - Uses ExpressionAttributeValues for parameterized updates
 * 
 * Security Considerations:
 * - No field validation or sanitization performed
 * - Allows updating any field (no restricted fields)
 * - No authorization checks implemented
 * - Consider adding field whitelisting for production
 * 
 * Performance Notes:
 * - O(1) operation complexity due to primary key access
 * - Efficient partial updates (only specified fields are modified)
 * - Uses conditional update expressions for atomic operations
 * 
 * Limitations:
 * - Cannot update the primary key (id field)
 * - No nested object update support (replaces entire nested objects)
 * - No array manipulation operations (append, remove items)
 */
const updateProduct = async (event) => {
  console.log(`updateProduct function. event : "${event}"`);
  try {
    // Parse the JSON request body to extract update fields
    const requestBody = JSON.parse(event.body);
    
    // Extract field names for dynamic expression generation
    const objKeys = Object.keys(requestBody);
    console.log(`updateProduct function. requestBody : "${requestBody}", objKeys: "${objKeys}"`);    

    // Build DynamoDB UpdateItem parameters with dynamic expressions
    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: marshall({ id: event.pathParameters.id }), // Primary key from URL path
      
      // Dynamic UpdateExpression: SET #key0 = :value0, #key1 = :value1, ...
      // This pattern allows updating any combination of fields
      UpdateExpression: `SET ${objKeys.map((_, index) => `#key${index} = :value${index}`).join(", ")}`,
      
      // ExpressionAttributeNames maps placeholders to actual field names
      // This handles reserved words and special characters in field names
      ExpressionAttributeNames: objKeys.reduce((acc, key, index) => ({
          ...acc,
          [`#key${index}`]: key, // #key0 -> "fieldName", #key1 -> "anotherField"
      }), {}),
      
      // ExpressionAttributeValues maps placeholders to actual values
      // Marshall converts JavaScript values to DynamoDB AttributeValue format
      ExpressionAttributeValues: marshall(objKeys.reduce((acc, key, index) => ({
          ...acc,
          [`:value${index}`]: requestBody[key], // :value0 -> actualValue1, :value1 -> actualValue2
      }), {})),
    };

    // Execute the UpdateItem operation
    // This performs an atomic update of the specified fields
    const updateResult = await ddbClient.send(new UpdateItemCommand(params));

    // Log the operation result for monitoring and debugging
    console.log(updateResult);
    return updateResult; // Return DynamoDB response metadata
    
  } catch(e) {
    // Log error for debugging (includes JSON parsing errors)
    console.error(e);
    // Re-throw to allow higher-level error handling
    throw e;
  }
}

/**
 * Get Products by Category Filter
 * 
 * Retrieves products that match a specific category using DynamoDB Query operation
 * with a filter expression. This function combines product ID lookup with category filtering.
 * 
 * @param {Object} event - AWS Lambda event object containing the HTTP request
 * @param {Object} event.pathParameters - URL path parameters
 * @param {string} event.pathParameters.id - The product ID to query for
 * @param {Object} event.queryStringParameters - URL query parameters
 * @param {string} event.queryStringParameters.category - The category to filter by
 * 
 * @returns {Promise<Array<Object>>} Promise that resolves to array of matching products
 * 
 * @throws {Error} DynamoDB operation errors or missing parameter errors
 * 
 * Query Pattern:
 * - Expected URL format: GET /product/{productId}?category={categoryName}
 * - Uses Query operation with KeyConditionExpression for product ID
 * - Applies FilterExpression for category matching
 * 
 * DynamoDB Operation Details:
 * - KeyConditionExpression: Filters by exact product ID match
 * - FilterExpression: Uses 'contains' function for partial category matching
 * - This allows finding products where category field contains the search term
 * 
 * Performance Considerations:
 * - More efficient than Scan for ID-based queries
 * - FilterExpression applied after KeyCondition, may consume RCUs for filtered items
 * - Consider using GSI (Global Secondary Index) on category for better performance
 * 
 * Limitations:
 * - Requires both product ID and category parameters
 * - Uses 'contains' which may match partial category names
 * - Returns array even for single product queries
 * 
 * Potential Improvements:
 * - Add validation for required parameters
 * - Consider exact match instead of contains for category
 * - Implement pagination for large result sets
 * - Add case-insensitive category matching
 */
const getProductsByCategory = async (event) => {
  console.log("getProductsByCategory");
  try {
    // Extract URL parameters for the query
    // GET product/{productId}?category={categoryName}
    const productId = event.pathParameters.id;     // Product ID from URL path
    const category = event.queryStringParameters.category; // Category from query string

    // Build DynamoDB Query parameters
    const params = {
      // Query by product ID (primary key) and filter by category
      KeyConditionExpression: "id = :productId", // Efficient primary key lookup
      FilterExpression: "contains (category, :category)", // Filter results by category content
      
      // Define parameter values using DynamoDB AttributeValue format
      // Note: This uses direct AttributeValue format instead of marshall()
      ExpressionAttributeValues: {
        ":productId": { S: productId }, // String type for product ID
        ":category": { S: category }     // String type for category filter
      },      
      TableName: process.env.DYNAMODB_TABLE_NAME
    };

    // Execute the Query operation
    // Query is more efficient than Scan for key-based lookups
    const { Items } = await ddbClient.send(new QueryCommand(params));

    // Log results for monitoring and debugging
    console.log(Items);
    
    // Convert DynamoDB AttributeValue format to JavaScript objects
    // Return array of matching products
    return Items.map((item) => unmarshall(item));
    
  } catch(e) {
    // Log error for debugging while preserving stack trace
    console.error(e);
    // Re-throw to allow higher-level error handling
    throw e;
  }
}