# AWS Microservices API Documentation

## Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [CDK Infrastructure Components](#cdk-infrastructure-components)
- [REST API Services](#rest-api-services)
- [Client Utilities](#client-utilities)
- [Data Models](#data-models)
- [Event-Driven Architecture](#event-driven-architecture)
- [Deployment Configuration](#deployment-configuration)
- [Error Handling](#error-handling)
- [Performance Considerations](#performance-considerations)

## Overview

This AWS microservices application is an e-commerce platform built using AWS CDK (Cloud Development Kit) and implements a serverless architecture with the following core services:

- **Product Service**: Manages product catalog with full CRUD operations
- **Basket Service**: Handles shopping cart functionality and checkout operations
- **Ordering Service**: Processes orders from basket checkouts via event-driven architecture

### Key Features
- **Serverless Architecture**: Built entirely on AWS Lambda functions
- **Event-Driven Design**: Uses EventBridge and SQS for asynchronous communication
- **RESTful APIs**: Exposed through AWS API Gateway
- **NoSQL Database**: Uses DynamoDB for data persistence
- **Infrastructure as Code**: Fully defined using AWS CDK in TypeScript

### Technology Stack
- **Runtime**: Node.js 14.x
- **Language**: JavaScript (Lambda functions), TypeScript (Infrastructure)
- **Database**: Amazon DynamoDB
- **API Gateway**: AWS API Gateway with Lambda integration
- **Messaging**: AWS EventBridge + SQS
- **Infrastructure**: AWS CDK 2.17.0

## Architecture

The application follows a microservices architecture pattern with the following components:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Product API    │    │   Basket API    │    │  Ordering API   │
│   Gateway       │    │    Gateway      │    │    Gateway      │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Product        │    │   Basket        │    │  Ordering       │
│  Lambda         │    │   Lambda        │    │  Lambda         │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          ▼                      │                      ▼
┌─────────────────┐              │            ┌─────────────────┐
│  Product        │              │            │  Orders         │
│  DynamoDB       │              │            │  DynamoDB       │
└─────────────────┘              │            └─────────────────┘
                                 │
                                 ▼
                       ┌─────────────────┐
                       │  Basket         │
                       │  DynamoDB       │
                       └─────────┬───────┘
                                 │
                                 ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │  EventBridge    │───▶│      SQS        │
                       │     Bus         │    │     Queue       │
                       └─────────────────┘    └─────────────────┘
```

## CDK Infrastructure Components

### AwsMicroservicesStack

**File**: `lib/aws-microservices-stack.ts`

The main CDK stack that orchestrates all infrastructure components.

#### Class: `AwsMicroservicesStack`

**Purpose**: Root CDK stack that creates and connects all AWS resources for the microservices application.

**Constructor Parameters**:
- `scope: Construct` - The CDK construct scope
- `id: string` - Unique identifier for the stack
- `props?: StackProps` - Optional stack properties

**Dependencies**: 
- `SwnDatabase` - DynamoDB tables
- `SwnMicroservices` - Lambda functions
- `SwnApiGateway` - API Gateway configuration
- `SwnQueue` - SQS queue for order processing
- `SwnEventBus` - EventBridge for event-driven communication

**Architecture Flow**:
1. Creates database tables
2. Creates Lambda functions with table permissions
3. Sets up API Gateway routing
4. Configures SQS queue for order processing
5. Establishes EventBridge for basket checkout events

---

### SwnDatabase

**File**: `lib/database.ts`

Creates and manages DynamoDB tables for the application.

#### Class: `SwnDatabase`

**Purpose**: Provisions DynamoDB tables with appropriate schemas and configurations.

**Public Properties**:
- `productTable: ITable` - Product catalog table
- `basketTable: ITable` - Shopping baskets table  
- `orderTable: ITable` - Orders table

**Constructor Parameters**:
- `scope: Construct` - Parent construct
- `id: string` - Construct identifier

#### Methods

##### `createProductTable(): ITable`
**Purpose**: Creates the product catalog table
**Schema**:
- **Partition Key**: `id` (String) - Unique product identifier
- **Attributes**: name, description, imageFile, price, category
- **Billing**: Pay-per-request
- **Removal Policy**: Destroy (for development)

##### `createBasketTable(): ITable` 
**Purpose**: Creates the shopping basket table
**Schema**:
- **Partition Key**: `userName` (String) - User identifier
- **Attributes**: items (List of Map objects containing quantity, color, price, productId, productName)
- **Billing**: Pay-per-request
- **Removal Policy**: Destroy (for development)

##### `createOrderTable(): ITable`
**Purpose**: Creates the orders table
**Schema**:
- **Partition Key**: `userName` (String) - User identifier
- **Sort Key**: `orderDate` (String) - ISO timestamp
- **Attributes**: totalPrice, firstName, lastName, email, address, paymentMethod, cardInfo
- **Billing**: Pay-per-request
- **Removal Policy**: Destroy (for development)

---

### SwnMicroservices

**File**: `lib/microservice.ts`

Creates and configures Lambda functions for each microservice.

#### Interface: `SwnMicroservicesProps`
```typescript
interface SwnMicroservicesProps {
    productTable: ITable;
    basketTable: ITable; 
    orderTable: ITable;
}
```

#### Class: `SwnMicroservices`

**Purpose**: Creates Lambda functions with proper environment variables and DynamoDB permissions.

**Public Properties**:
- `productMicroservice: NodejsFunction` - Product service Lambda
- `basketMicroservice: NodejsFunction` - Basket service Lambda
- `orderingMicroservice: NodejsFunction` - Ordering service Lambda

**Constructor Parameters**:
- `scope: Construct` - Parent construct
- `id: string` - Construct identifier
- `props: SwnMicroservicesProps` - Table references

#### Methods

##### `createProductFunction(productTable: ITable): NodejsFunction`
**Purpose**: Creates the product service Lambda function
**Environment Variables**:
- `PRIMARY_KEY`: "id"
- `DYNAMODB_TABLE_NAME`: Product table name
**Runtime**: Node.js 14.x
**Permissions**: Read/write access to product table

##### `createBasketFunction(basketTable: ITable): NodejsFunction`
**Purpose**: Creates the basket service Lambda function  
**Environment Variables**:
- `PRIMARY_KEY`: "userName"
- `DYNAMODB_TABLE_NAME`: Basket table name
- `EVENT_SOURCE`: "com.swn.basket.checkoutbasket"
- `EVENT_DETAILTYPE`: "CheckoutBasket"
- `EVENT_BUSNAME`: "SwnEventBus"
**Runtime**: Node.js 14.x
**Permissions**: Read/write access to basket table

##### `createOrderingFunction(orderTable: ITable): NodejsFunction`
**Purpose**: Creates the ordering service Lambda function
**Environment Variables**:
- `PRIMARY_KEY`: "userName"
- `SORT_KEY`: "orderDate"
- `DYNAMODB_TABLE_NAME`: Order table name
**Runtime**: Node.js 14.x  
**Permissions**: Read/write access to order table

---

### SwnApiGateway

**File**: `lib/apigateway.ts`

Creates REST API endpoints for each microservice.

#### Interface: `SwnApiGatewayProps`
```typescript
interface SwnApiGatewayProps {
    productMicroservice: IFunction;
    basketMicroservice: IFunction;
    orderingMicroservices: IFunction;
}
```

#### Class: `SwnApiGateway`

**Purpose**: Creates API Gateway REST APIs with proper routing for each microservice.

**Constructor Parameters**:
- `scope: Construct` - Parent construct
- `id: string` - Construct identifier
- `props: SwnApiGatewayProps` - Lambda function references

#### Methods

##### `createProductApi(productMicroservice: IFunction): void`
**Purpose**: Creates REST API for product service
**API Name**: "Product Service"
**Endpoints**:
- `GET /product` - Get all products
- `POST /product` - Create new product
- `GET /product/{id}` - Get specific product
- `PUT /product/{id}` - Update product
- `DELETE /product/{id}` - Delete product

##### `createBasketApi(basketMicroservice: IFunction): void`
**Purpose**: Creates REST API for basket service
**API Name**: "Basket Service"
**Endpoints**:
- `GET /basket` - Get all baskets
- `POST /basket` - Create/update basket
- `GET /basket/{userName}` - Get user's basket
- `DELETE /basket/{userName}` - Delete user's basket
- `POST /basket/checkout` - Checkout basket

##### `createOrderApi(orderingMicroservices: IFunction): void`
**Purpose**: Creates REST API for ordering service
**API Name**: "Order Service"
**Endpoints**:
- `GET /order` - Get all orders
- `GET /order/{userName}` - Get user's orders (supports orderDate query parameter)

---

### SwnEventBus

**File**: `lib/eventbus.ts`

Manages EventBridge configuration for event-driven architecture.

#### Interface: `SwnEventBusProps`
```typescript
interface SwnEventBusProps {
    publisherFuntion: IFunction;
    targetQueue: IQueue;
}
```

#### Class: `SwnEventBus`

**Purpose**: Creates EventBridge bus and rules for handling basket checkout events.

**Constructor Parameters**:
- `scope: Construct` - Parent construct
- `id: string` - Construct identifier
- `props: SwnEventBusProps` - Publisher function and target queue

**Event Configuration**:
- **Event Bus Name**: "SwnEventBus"
- **Rule**: "CheckoutBasketRule"
- **Event Pattern**:
  - Source: "com.swn.basket.checkoutbasket"
  - Detail Type: "CheckoutBasket"
- **Target**: SQS Queue (for ordering service)
- **Permissions**: Grants PutEvents permission to basket service

---

### SwnQueue

**File**: `lib/queue.ts`

Creates and configures SQS queue for order processing.

#### Interface: `SwnQueueProps`
```typescript
interface SwnQueueProps {
    consumer: IFunction;
}
```

#### Class: `SwnQueue`

**Purpose**: Creates SQS queue with Lambda event source mapping for order processing.

**Public Properties**:
- `orderQueue: IQueue` - The SQS queue for orders

**Constructor Parameters**:
- `scope: Construct` - Parent construct
- `id: string` - Construct identifier
- `props: SwnQueueProps` - Consumer Lambda function

**Queue Configuration**:
- **Queue Name**: "OrderQueue"
- **Visibility Timeout**: 30 seconds
- **Batch Size**: 1 message per invocation
- **Event Source**: Connected to ordering Lambda function

## REST API Services

### Product Service

**File**: `src/product/index.js`

RESTful API for product catalog management with full CRUD operations.

#### Main Handler Function

##### `exports.handler(event): Promise<Object>`

**Purpose**: Main Lambda entry point that routes HTTP requests to appropriate CRUD operations.

**Parameters**:
- `event: Object` - AWS Lambda event object
  - `httpMethod: string` - HTTP method (GET, POST, PUT, DELETE)
  - `pathParameters: Object` - URL path parameters
  - `queryStringParameters: Object` - URL query parameters  
  - `body: string` - Request body (JSON string)

**Returns**:
```typescript
{
  statusCode: number,
  body: string // JSON stringified response
}
```

**Success Response Format**:
```json
{
  "statusCode": 200,
  "body": "{\"message\": \"Successfully finished operation: [METHOD]\", \"body\": [result]}"
}
```

**Error Response Format**:
```json
{
  "statusCode": 500,
  "body": "{\"message\": \"Failed to perform operation.\", \"errorMsg\": \"[error]\", \"errorStack\": \"[stack]\"}"
}
```

**Routing Logic**:
- `GET /product` → `getAllProducts()`
- `GET /product/{id}` → `getProduct(id)`
- `GET /product/{id}?category=X` → `getProductsByCategory(event)`
- `POST /product` → `createProduct(event)`
- `PUT /product/{id}` → `updateProduct(event)`
- `DELETE /product/{id}` → `deleteProduct(id)`

#### CRUD Operations

##### `getProduct(productId: string): Promise<Object>`

**Purpose**: Retrieves a single product by ID using DynamoDB GetItem operation.

**Parameters**:
- `productId: string` - Unique product identifier

**Returns**: 
- `Promise<Object>` - Product object if found, empty object if not found

**Performance**: O(1) complexity with primary key lookup

**Example Response**:
```json
{
  "id": "uuid-here",
  "name": "iPhone 13",
  "description": "Latest iPhone model",
  "price": 999.99,
  "category": "Electronics"
}
```

**Throws**: DynamoDB operation errors

---

##### `getAllProducts(): Promise<Array<Object>>`

**Purpose**: Retrieves all products using DynamoDB Scan operation.

**Returns**: 
- `Promise<Array<Object>>` - Array of all products or empty object

**Performance Considerations**:
- ⚠️ **Expensive Operation**: Uses Scan which reads entire table
- O(n) complexity where n = total items in table
- Consumes significant RCUs
- Consider pagination for large datasets
- Alternative: Use Query with GSI for filtered retrieval

**Example Response**:
```json
[
  {
    "id": "uuid-1",
    "name": "iPhone 13", 
    "price": 999.99,
    "category": "Electronics"
  },
  {
    "id": "uuid-2",
    "name": "MacBook Pro",
    "price": 1999.99, 
    "category": "Computers"
  }
]
```

**Throws**: DynamoDB operation errors

---

##### `createProduct(event: Object): Promise<Object>`

**Purpose**: Creates a new product with auto-generated UUID.

**Parameters**:
- `event: Object` - Lambda event containing request body

**Request Body Example**:
```json
{
  "name": "New Product",
  "description": "Product description", 
  "price": 29.99,
  "category": "Category"
}
```

**Business Logic**:
- Auto-generates UUID v4 for product ID
- Overwrites any provided ID for security
- No schema validation (flexible structure)
- No duplicate checking

**Returns**: 
- `Promise<Object>` - DynamoDB PutItem response metadata

**Throws**: JSON parsing errors, DynamoDB operation errors

---

##### `updateProduct(event: Object): Promise<Object>`

**Purpose**: Updates existing product fields using dynamic UpdateExpression.

**Parameters**:
- `event: Object` - Lambda event containing request body and path parameters

**Request Body Example**:
```json
{
  "name": "Updated Product Name",
  "price": 39.99
}
```

**Update Behavior**:
- Updates only fields provided in request body
- Preserves existing fields not mentioned
- Creates item if doesn't exist (upsert behavior)
- Uses dynamic expression generation for any field combination

**Dynamic Expression Generation**:
```typescript
// Generated expressions example:
UpdateExpression: "SET #key0 = :value0, #key1 = :value1"
ExpressionAttributeNames: { "#key0": "name", "#key1": "price" }
ExpressionAttributeValues: { ":value0": "Updated Name", ":value1": 39.99 }
```

**Security Considerations**:
- ⚠️ No field validation or sanitization
- ⚠️ Allows updating any field (no restrictions)
- ⚠️ No authorization checks

**Returns**: 
- `Promise<Object>` - DynamoDB UpdateItem response metadata

**Throws**: JSON parsing errors, DynamoDB operation errors

---

##### `deleteProduct(productId: string): Promise<Object>`

**Purpose**: Permanently deletes a product by ID.

**Parameters**:
- `productId: string` - Unique product identifier

**Deletion Behavior**:
- Immediate deletion without confirmation
- No validation that product exists
- Idempotent operation (succeeds even if ID doesn't exist)
- Cannot be undone

**Security Considerations**:
- ⚠️ No authorization checks
- ⚠️ Permanent data loss
- ⚠️ No audit trail
- 💡 Consider soft delete pattern for production

**Returns**: 
- `Promise<Object>` - DynamoDB DeleteItem response metadata

**Throws**: DynamoDB operation errors

---

##### `getProductsByCategory(event: Object): Promise<Array<Object>>`

**Purpose**: Retrieves products filtered by category using Query operation.

**Parameters**:
- `event: Object` - Lambda event with path and query parameters

**Expected URL Format**: `GET /product/{productId}?category={categoryName}`

**Query Logic**:
- Uses KeyConditionExpression for product ID
- Applies FilterExpression for category matching
- Uses 'contains' function for partial matching

**DynamoDB Operation**:
```typescript
{
  KeyConditionExpression: "id = :productId",
  FilterExpression: "contains (category, :category)",
  ExpressionAttributeValues: {
    ":productId": { S: productId },
    ":category": { S: category }
  }
}
```

**Performance Notes**:
- More efficient than Scan for ID-based queries  
- FilterExpression applied after KeyCondition
- Consider GSI on category for better performance

**Returns**: 
- `Promise<Array<Object>>` - Array of matching products

**Throws**: DynamoDB operation errors, missing parameter errors

### Product Service REST API Endpoints

| Method | Endpoint | Description | Request Body | Response | Status Codes |
|--------|----------|-------------|--------------|----------|-------------|
| GET | `/product` | Get all products | None | Array of products | 200, 500 |
| GET | `/product/{id}` | Get product by ID | None | Product object | 200, 500 |
| GET | `/product/{id}?category=X` | Filter by category | None | Array of products | 200, 500 |
| POST | `/product` | Create new product | Product data (JSON) | Operation result | 200, 500 |
| PUT | `/product/{id}` | Update product | Partial product data (JSON) | Operation result | 200, 500 |
| DELETE | `/product/{id}` | Delete product | None | Operation result | 200, 500 |

**Authentication**: None implemented (⚠️ Add authentication for production)
**Rate Limiting**: None implemented (⚠️ Consider API Gateway throttling)

---

### Basket Service

**File**: `src/basket/index.js`

Shopping cart management service with checkout functionality.

#### Main Handler Function

##### `exports.handler(event): Promise<Object>`

**Purpose**: Routes HTTP requests for basket operations and checkout workflow.

**Parameters**:
- `event: Object` - AWS Lambda event object

**Routing Logic**:
- `GET /basket` → `getAllBaskets()`
- `GET /basket/{userName}` → `getBasket(userName)`
- `POST /basket` → `createBasket(event)`
- `POST /basket/checkout` → `checkoutBasket(event)`
- `DELETE /basket/{userName}` → `deleteBasket(userName)`

#### CRUD Operations

##### `getBasket(userName: string): Promise<Object>`

**Purpose**: Retrieves a user's shopping basket.

**Parameters**:
- `userName: string` - User identifier (partition key)

**Returns**: 
- `Promise<Object>` - Basket object with items or empty object

**Example Response**:
```json
{
  "userName": "john_doe",
  "items": [
    {
      "productId": "uuid-1",
      "productName": "iPhone 13",
      "quantity": 1,
      "price": 999.99,
      "color": "Blue"
    }
  ]
}
```

---

##### `getAllBaskets(): Promise<Array<Object>>`

**Purpose**: Retrieves all user baskets (admin operation).

**Returns**: 
- `Promise<Array<Object>>` - Array of all baskets

**Performance**: ⚠️ Uses Scan operation - expensive for large datasets

---

##### `createBasket(event: Object): Promise<Object>`

**Purpose**: Creates or updates a user's basket.

**Parameters**:
- `event: Object` - Lambda event with request body

**Request Body Example**:
```json
{
  "userName": "john_doe",
  "items": [
    {
      "productId": "uuid-1", 
      "productName": "iPhone 13",
      "quantity": 2,
      "price": 999.99,
      "color": "Blue"
    }
  ]
}
```

**Behavior**: Uses PutItem (overwrites existing basket)

---

##### `deleteBasket(userName: string): Promise<Object>`

**Purpose**: Removes a user's basket completely.

**Parameters**:
- `userName: string` - User identifier

**Use Cases**: 
- After checkout completion
- User explicitly clears basket
- Admin operations

---

#### Checkout Workflow

##### `checkoutBasket(event: Object): Promise<void>`

**Purpose**: Orchestrates the complete checkout process with event publishing.

**Parameters**:
- `event: Object` - Lambda event with checkout request

**Request Body Example**:
```json
{
  "userName": "john_doe",
  "firstName": "John",
  "lastName": "Doe", 
  "email": "john@example.com",
  "address": "123 Main St",
  "paymentMethod": "Credit Card"
}
```

**Checkout Process**:
1. **Validation**: Ensures userName exists in request
2. **Basket Retrieval**: Gets existing basket with items
3. **Order Preparation**: Calculates totals and enriches data
4. **Event Publishing**: Publishes checkout event to EventBridge
5. **Cleanup**: Removes basket after successful event publishing

**Throws**: 
- Error if userName missing
- Error if basket empty or doesn't exist
- EventBridge publishing errors

---

##### `prepareOrderPayload(checkoutRequest: Object, basket: Object): Object`

**Purpose**: Aggregates checkout request and basket data for order creation.

**Parameters**:
- `checkoutRequest: Object` - User checkout information
- `basket: Object` - User's basket with items

**Business Logic**:
- Validates basket contains items
- Calculates total price by summing item prices
- Merges checkout request with basket data
- Prepares complete order payload

**Example Output**:
```json
{
  "userName": "john_doe",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com", 
  "totalPrice": 1999.98,
  "items": [
    {
      "productId": "uuid-1",
      "productName": "iPhone 13", 
      "quantity": 2,
      "price": 999.99
    }
  ]
}
```

**Validation**: Throws error if basket or items are null

---

##### `publishCheckoutBasketEvent(checkoutPayload: Object): Promise<Object>`

**Purpose**: Publishes checkout event to EventBridge for order processing.

**Parameters**:
- `checkoutPayload: Object` - Complete order data

**EventBridge Event Structure**:
```json
{
  "Entries": [
    {
      "Source": "com.swn.basket.checkoutbasket",
      "Detail": "{...checkoutPayload...}",
      "DetailType": "CheckoutBasket", 
      "Resources": [],
      "EventBusName": "SwnEventBus"
    }
  ]
}
```

**Environment Variables Used**:
- `EVENT_SOURCE`: "com.swn.basket.checkoutbasket"  
- `EVENT_DETAILTYPE`: "CheckoutBasket"
- `EVENT_BUSNAME`: "SwnEventBus"

**Returns**: 
- `Promise<Object>` - EventBridge PutEvents response

### Basket Service REST API Endpoints

| Method | Endpoint | Description | Request Body | Response | Status Codes |
|--------|----------|-------------|--------------|----------|-------------|
| GET | `/basket` | Get all baskets | None | Array of baskets | 200, 500 |
| GET | `/basket/{userName}` | Get user's basket | None | Basket object | 200, 500 |
| POST | `/basket` | Create/update basket | Basket data (JSON) | Operation result | 200, 500 |
| POST | `/basket/checkout` | Checkout basket | User info (JSON) | Checkout result | 200, 500 |
| DELETE | `/basket/{userName}` | Delete user's basket | None | Operation result | 200, 500 |

**Checkout Request Schema**:
```json
{
  "userName": "string (required)",
  "firstName": "string",
  "lastName": "string", 
  "email": "string",
  "address": "string",
  "paymentMethod": "string"
}
```

---

### Ordering Service

**File**: `src/ordering/index.js`

Order management service that handles multiple invocation types (API Gateway, EventBridge, SQS).

#### Main Handler Function

##### `exports.handler(event): Promise<Object|void>`

**Purpose**: Multi-purpose handler that routes based on event source type.

**Event Source Detection**:
- **SQS Records**: `event.Records != null` → `sqsInvocation(event)`
- **EventBridge**: `event['detail-type'] !== undefined` → `eventBridgeInvocation(event)`  
- **API Gateway**: Default → `apiGatewayInvocation(event)`

**Returns**: 
- API Gateway: Response object with status code and body
- SQS/EventBridge: void (asynchronous processing)

#### Event-Driven Processing

##### `sqsInvocation(event: Object): Promise<void>`

**Purpose**: Processes order creation messages from SQS queue.

**Parameters**:
- `event: Object` - SQS event with Records array

**Message Processing**:
- Iterates through `event.Records`
- Parses message body as checkout event JSON
- Extracts order details from `record.body.detail`
- Creates order record in DynamoDB

**Expected Message Format**:
```json
{
  "detail-type": "CheckoutBasket",
  "source": "com.swn.basket.checkoutbasket", 
  "detail": {
    "userName": "john_doe",
    "totalPrice": 1999.98,
    "items": [...],
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

---

##### `eventBridgeInvocation(event: Object): Promise<void>`

**Purpose**: Processes direct EventBridge invocations (alternative to SQS).

**Parameters**:
- `event: Object` - EventBridge event object

**Processing**: Creates order directly from `event.detail`

---

##### `createOrder(basketCheckoutEvent: Object): Promise<Object>`

**Purpose**: Creates order record in DynamoDB with timestamp.

**Parameters**:
- `basketCheckoutEvent: Object` - Complete checkout data

**Business Logic**:
- Adds ISO timestamp as `orderDate` (sort key)
- Stores complete order data including items and user details
- Uses marshall for DynamoDB attribute conversion

**Generated Order Example**:
```json
{
  "userName": "john_doe",
  "orderDate": "2024-01-15T10:30:00.000Z",
  "totalPrice": 1999.98,
  "firstName": "John",
  "lastName": "Doe", 
  "email": "john@example.com",
  "items": [...]
}
```

#### REST API Operations

##### `apiGatewayInvocation(event: Object): Promise<Object>`

**Purpose**: Handles synchronous API requests for order retrieval.

**Supported Operations**:
- `GET /order` → `getAllOrders()`
- `GET /order/{userName}` → `getOrder(event)`

---

##### `getOrder(event: Object): Promise<Array<Object>>`

**Purpose**: Retrieves specific user orders with optional date filtering.

**Parameters**:
- `event: Object` - API Gateway event

**Query Parameters**:
- **Path**: `{userName}` - User identifier
- **Query String**: `?orderDate=timestamp` - Optional date filter

**Expected URL**: `GET /order/{userName}?orderDate=2024-01-15T10:30:00.000Z`

**DynamoDB Query**:
```typescript
{
  KeyConditionExpression: "userName = :userName and orderDate = :orderDate",
  ExpressionAttributeValues: {
    ":userName": { S: userName },
    ":orderDate": { S: orderDate }
  }
}
```

**Returns**: 
- `Promise<Array<Object>>` - Array of matching orders

---

##### `getAllOrders(): Promise<Array<Object>>`

**Purpose**: Retrieves all orders across all users (admin operation).

**Performance**: ⚠️ Uses Scan operation - expensive for large datasets

**Returns**: 
- `Promise<Array<Object>>` - Array of all orders

### Ordering Service REST API Endpoints

| Method | Endpoint | Description | Query Parameters | Response | Status Codes |
|--------|----------|-------------|------------------|----------|-------------|
| GET | `/order` | Get all orders | None | Array of orders | 200, 500 |
| GET | `/order/{userName}` | Get user orders | `orderDate` (optional) | Array of user orders | 200, 500 |

**Query Example**: 
```
GET /order/john_doe?orderDate=2024-01-15T10:30:00.000Z
```

**Response Example**:
```json
[
  {
    "userName": "john_doe",
    "orderDate": "2024-01-15T10:30:00.000Z", 
    "totalPrice": 1999.98,
    "firstName": "John",
    "lastName": "Doe",
    "items": [...]
  }
]
```

## Client Utilities

### DynamoDB Client

**Files**: 
- `src/product/ddbClient.js`
- `src/basket/ddbClient.js` 
- `src/ordering/ddbClient.js`

#### Module: `ddbClient`

**Purpose**: Centralized DynamoDB client configuration for Lambda functions.

```javascript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
const ddbClient = new DynamoDBClient();
export { ddbClient };
```

**Features**:
- Uses AWS SDK v3 for DynamoDB operations
- Inherits region and credentials from Lambda execution environment
- Singleton pattern for connection reuse
- No custom configuration (uses defaults)

**Used Operations**:
- `GetItemCommand` - Single item retrieval
- `PutItemCommand` - Item creation/replacement  
- `UpdateItemCommand` - Partial item updates
- `DeleteItemCommand` - Item removal
- `ScanCommand` - Full table scans
- `QueryCommand` - Key-based queries with filters

### EventBridge Client

**File**: `src/basket/eventBridgeClient.js`

#### Module: `ebClient`

**Purpose**: EventBridge client for publishing basket checkout events.

```javascript
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
export const ebClient = new EventBridgeClient();
```

**Features**:
- Uses AWS SDK v3 for EventBridge operations
- Default regional configuration
- Used exclusively for `PutEventsCommand`

**Event Publishing Pattern**:
```javascript
const params = {
  Entries: [{
    Source: process.env.EVENT_SOURCE,
    Detail: JSON.stringify(eventData),
    DetailType: process.env.EVENT_DETAILTYPE,
    EventBusName: process.env.EVENT_BUSNAME
  }]
};
```

## Data Models

### Product Schema

**Table**: `product`
**Partition Key**: `id` (String)

```json
{
  "id": "uuid-v4-string",
  "name": "string", 
  "description": "string",
  "price": "number",
  "category": "string", 
  "imageFile": "string"
}
```

**Constraints**:
- `id`: Auto-generated UUID v4, immutable
- `name`: Product display name
- `price`: Numeric value (no currency validation)
- `category`: Used for filtering operations
- Schema is flexible - additional fields allowed

### Basket Schema

**Table**: `basket`
**Partition Key**: `userName` (String)

```json
{
  "userName": "string",
  "items": [
    {
      "productId": "string",
      "productName": "string", 
      "quantity": "number",
      "price": "number",
      "color": "string"
    }
  ]
}
```

**Constraints**:
- `userName`: User identifier, must be unique
- `items`: Array of product items in basket
- Each item contains product reference and user selections
- No quantity limits or validation

### Order Schema

**Table**: `order`
**Partition Key**: `userName` (String)
**Sort Key**: `orderDate` (String - ISO timestamp)

```json
{
  "userName": "string",
  "orderDate": "2024-01-15T10:30:00.000Z",
  "totalPrice": "number",
  "firstName": "string",
  "lastName": "string", 
  "email": "string",
  "address": "string",
  "paymentMethod": "string",
  "items": [
    {
      "productId": "string",
      "productName": "string",
      "quantity": "number", 
      "price": "number"
    }
  ]
}
```

**Constraints**:
- `userName` + `orderDate`: Composite primary key
- `orderDate`: Auto-generated ISO timestamp
- `totalPrice`: Calculated from item prices
- User and payment information from checkout request
- `items`: Copied from basket at checkout time

## Event-Driven Architecture

### Event Flow

```
Basket Service → EventBridge → SQS Queue → Ordering Service
```

### Event Schemas

#### Checkout Basket Event

**Source**: `com.swn.basket.checkoutbasket`
**Detail Type**: `CheckoutBasket`
**Event Bus**: `SwnEventBus`

```json
{
  "Source": "com.swn.basket.checkoutbasket",
  "DetailType": "CheckoutBasket",
  "Detail": "{...order payload...}",
  "EventBusName": "SwnEventBus"
}
```

### Event Processing Chain

1. **User Checkout**: `POST /basket/checkout`
2. **Basket Service**: 
   - Validates request
   - Retrieves basket
   - Calculates totals  
   - Publishes event to EventBridge
   - Deletes basket
3. **EventBridge**: Routes event based on source/detail-type pattern
4. **SQS Queue**: Receives event from EventBridge rule
5. **Ordering Service**: Processes SQS message and creates order

### Error Handling in Events

**Basket Service**: 
- Validation errors prevent event publishing
- EventBridge errors propagate to API response
- Basket deletion only occurs after successful event publishing

**Ordering Service**:
- SQS provides automatic retry with dead letter queue capability
- Malformed events logged but don't crash service
- DynamoDB errors logged for monitoring

## Deployment Configuration

### CDK Configuration

**File**: `cdk.json`

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/aws-microservices.ts",
  "context": {
    "@aws-cdk/aws-apigateway:usagePlanKeyOrderInsensitiveId": true,
    "@aws-cdk/core:stackRelativeExports": true
  }
}
```

### Package Configuration

**File**: `package.json`

**Dependencies**:
- `aws-cdk-lib: 2.17.0` - CDK framework
- `constructs: ^10.0.0` - CDK constructs
- `source-map-support: ^0.5.16` - Source map support

**Dev Dependencies**:
- `aws-cdk: 2.17.0` - CDK CLI
- `typescript: ~3.9.7` - TypeScript compiler
- `ts-node: ^9.0.0` - TypeScript execution
- `jest: ^26.4.2` - Testing framework

**Scripts**:
- `npm run build` - Compile TypeScript
- `npm run watch` - Watch mode compilation
- `npm run test` - Run Jest tests
- `npm run cdk` - CDK CLI commands

### Environment Variables

#### Product Service
- `DYNAMODB_TABLE_NAME`: Product table name
- `PRIMARY_KEY`: "id"

#### Basket Service  
- `DYNAMODB_TABLE_NAME`: Basket table name
- `PRIMARY_KEY`: "userName"
- `EVENT_SOURCE`: "com.swn.basket.checkoutbasket"
- `EVENT_DETAILTYPE`: "CheckoutBasket" 
- `EVENT_BUSNAME`: "SwnEventBus"

#### Ordering Service
- `DYNAMODB_TABLE_NAME`: Order table name
- `PRIMARY_KEY`: "userName"
- `SORT_KEY`: "orderDate"

### Deployment Commands

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run build

# Deploy stack
npm run cdk deploy

# Destroy stack  
npm run cdk destroy
```

## Error Handling

### Standard Error Response Format

All services return standardized error responses:

```json
{
  "statusCode": 500,
  "body": "{\"message\": \"Failed to perform operation.\", \"errorMsg\": \"[error message]\", \"errorStack\": \"[stack trace]\"}"
}
```

### Common Error Types

#### Validation Errors
- Missing required fields (userName for checkout)
- Invalid JSON in request body
- Missing path parameters

#### DynamoDB Errors  
- Network connectivity issues
- Permission errors (AccessDeniedException)
- Throttling errors (ProvisionedThroughputExceededException)
- Item not found (handled gracefully)

#### EventBridge Errors
- Permission errors (AccessDeniedException) 
- Event bus not found
- Malformed event structure

### Error Recovery Patterns

#### Basket Checkout
- Basket deletion only occurs after successful event publishing
- Failed events don't remove user's basket
- User can retry checkout operation

#### Order Processing
- SQS provides automatic retry mechanism
- Dead letter queues can capture failed messages
- Duplicate order prevention through timestamp precision

### Logging Strategy

All services implement comprehensive logging:

```javascript
// Request logging
console.log("request:", JSON.stringify(event, undefined, 2));

// Operation results
console.log(operationResult);

// Error logging with stack traces
console.error(e);
```

**⚠️ Production Considerations**:
- Remove or sanitize sensitive information from logs
- Implement structured logging with correlation IDs
- Consider log aggregation and monitoring solutions

## Performance Considerations

### DynamoDB Operations

#### Efficient Operations ✅
- `GetItem` - O(1) with partition key
- `Query` - Efficient with partition key + optional sort key
- `PutItem` - O(1) write operation
- `UpdateItem` - O(1) with primary key
- `DeleteItem` - O(1) with primary key

#### Expensive Operations ⚠️
- `Scan` - Reads entire table, O(n) complexity
- Used in: `getAllProducts()`, `getAllBaskets()`, `getAllOrders()`
- **Recommendation**: Implement pagination or use Query with GSI

### Lambda Cold Starts

**Mitigation Strategies**:
- Connection reuse with singleton DynamoDB clients
- Minimal bundle sizes with external modules exclusion
- Consider provisioned concurrency for high-traffic APIs

### API Gateway Performance

**Current State**: No optimizations implemented

**Recommendations**:
- Enable caching for read operations
- Implement request/response compression  
- Add CloudFront distribution for static content
- Configure throttling limits

### Cost Optimization

#### DynamoDB
- **Billing Mode**: Pay-per-request (good for variable workloads)
- **Alternative**: Provisioned capacity for predictable traffic
- **GSI Recommendation**: Add category index for product filtering

#### Lambda
- **Memory**: Default allocation (consider optimization based on profiling)
- **Timeout**: Default values (adjust based on operation complexity)

### Scalability Considerations

#### Current Limitations
- No pagination implemented
- Scan operations don't scale well
- No caching layer

#### Scaling Recommendations
- Implement pagination with LastEvaluatedKey
- Add ElastiCache for frequently accessed data
- Consider DynamoDB Global Tables for multi-region
- Implement connection pooling for high throughput

### Monitoring and Observability

**Current State**: Basic console logging only

**Production Recommendations**:
- CloudWatch custom metrics
- AWS X-Ray for distributed tracing  
- CloudWatch Dashboards for operational metrics
- Alerts for error rates and latency thresholds

## Version Information

- **CDK Version**: 2.17.0
- **Node.js Runtime**: 14.x
- **TypeScript**: ~3.9.7
- **AWS SDK**: v3 (latest in Lambda runtime)

## Known Limitations

### Security
- ❌ No authentication/authorization
- ❌ No input validation or sanitization
- ❌ No rate limiting
- ❌ No CORS configuration

### Data Validation  
- ❌ No schema validation
- ❌ No business rule enforcement
- ❌ No duplicate prevention (except UUID collision)

### Error Recovery
- ❌ No transaction support across services
- ❌ No compensation patterns for failed operations
- ❌ Limited retry mechanisms

### Operational
- ❌ No health checks
- ❌ No metrics or monitoring
- ❌ No backup/restore procedures
- ❌ No deployment pipelines

## Deprecated Features

*None currently - this is a new implementation*

## Future Enhancements

### Short Term
1. Add input validation and sanitization
2. Implement authentication/authorization
3. Add comprehensive error handling
4. Implement pagination for list operations

### Medium Term  
1. Add caching layer (ElastiCache)
2. Implement monitoring and alerting
3. Add integration tests
4. Create deployment pipeline

### Long Term
1. Microservice decomposition
2. Event sourcing patterns
3. Multi-region deployment
4. Advanced analytics and reporting

---

*This documentation is current as of October 2024. For the latest updates and changes, please refer to the project repository and release notes.*
