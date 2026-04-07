const mongoose = require("mongoose");
const Product = require("../models/Product"); // Adjust the path as necessary
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Connect to MongoDB
mongoose.connect("mongodb+srv://development:SLIyrnQjEAR6lJs0@bazaar.6yyfd.mongodb.net/tetsingcoupon", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log("MongoDB connected successfully");
})
.catch(err => {
    console.error("MongoDB connection error:", err);
});

// Function to fetch specific keys from products and write to CSV
const fetchSpecificKeysFromProducts = async () => {
    try {
        // Fetch only two products with specific fields
        const products = await Product.find({}, {
            'product.id': 1,
            'product.name': 1, // This is the title
            'product.description': 1,
            'product.is_active': 1, // Assuming this indicates availability
            'product.images': { $slice: 1 }, // Get only the first image
            'variantsData.sku': 1,
            'variantsData.price': 1,
            'variantsData.id': 1,

        });

        // Prepare data for CSV
        const csvData = [];

        products.forEach(product => {
            const baseId = product.product.id;
            const title = product.product.name;
            const description = product.product.description;
            const availability = product.product.is_active ? 'Available' : 'Not Available';
            const imageLink = product.product.images[0]?.sizes?.original; // Use optional chaining

            product.variantsData.forEach(variant => {
                const sku = variant.sku.split('-')[0].toLowerCase();
                csvData.push({
                    id: variant?.id,
                    title: title,
                    description: description,
                    availability: 'in stock',
                    condition: sku, // SKU as condition
                    price: `${variant.price}.00 AED`, // Price from variantsData
                    link: `https://www.bazaar-uae.com/product-details/${baseId}`, // Constructed link
                    image_link: imageLink, // Image link
                    brand: product.product.brand_id // Assuming brand_id is the brand
                });
            });
        });

        // Define CSV writer
        const csvWriter = createCsvWriter({
            path: 'products.csv', // Output file path
            header: [
                { id: 'id', title: 'id' },
                { id: 'title', title: 'title' },
                { id: 'description', title: 'description' },
                { id: 'availability', title: 'availability' },
                { id: 'condition', title: 'condition' },
                { id: 'price', title: 'price' },
                { id: 'link', title: 'link' },
                { id: 'image_link', title: 'image_link' },
                { id: 'brand', title: 'brand' }
            ]
        });

        // Write data to CSV
        await csvWriter.writeRecords(csvData);
        console.log("CSV file written successfully!");

    } catch (error) {
        console.error("Error fetching products:", error);
    } finally {
        mongoose.connection.close(); // Close the connection
    }
};

// Call the function to fetch specific keys and write to CSV
fetchSpecificKeysFromProducts();
