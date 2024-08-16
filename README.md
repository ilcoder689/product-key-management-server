# Product Keys Management Server

A basic product key management server which manages product keys and their activations on different systems.
Supports key expiry, multiple systems on same key and renewal.

## Tech Used

- Node.js
- ExpressJS
- MongoDB
- HTML & CSS

## APIs

- `POST /product-keys` - Add a new product key
- `POST /product-keys/validate` - Validate a product key activation on a particular installation id. Creates new activation, if not exist and it can be activated.
- `PUT /product-keys/:key` - Update a product key
- `DELETE /product-keys/:key` - Delete a product key
- `GET /product-keys` - List all product keys
- `DELETE /product-keys/:key/activations/:installationId` - Delete a particular activation from a product key
