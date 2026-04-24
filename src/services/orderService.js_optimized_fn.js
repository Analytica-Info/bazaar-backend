async function updateQuantities(cartData, orderId = null) {
    try {
        const emailDetails = [];
        const mongoIds = cartData.map(item => item.product_id || item.id).filter(Boolean);
        
        // 1. Batch fetch all local products at once
        const localProducts = await Product.find({ _id: { $in: mongoIds } }).lean();
        const localProductMap = Object.fromEntries(localProducts.map(p => [p._id.toString(), p]));

        // 2. Prepare for batch processing
        // We use a simple in-memory cache for fetchProductDetails to avoid hitting LS API multiple times for the same parent
        const lsProductDetailsCache = new Map();

        const updateResults = await Promise.all(
            cartData.map(async (item) => {
                const updateQty = item.total_qty - item.qty;
                const mongoId = item.product_id || item.id;
                const mongoObjectId = mongoId?.toString();
                const name = item.name;
                const lightspeedVariantId = item.variantId || item.id;

                // Diagnostics are expensive; we'll fetch 'before' state.
                const beforeDiag = await getDiagnosticInventory(lightspeedVariantId);

                let update = true; // Logic currently assumes true; updateQuantity is commented out.

                try {
                    const qtySold = item.qty || 0;
                    const currentDoc = localProductMap[mongoObjectId];
                    if (!currentDoc) {
                        throw new Error(`Product not found for _id=${mongoObjectId}`);
                    }

                    const mainProductId = currentDoc.product?.id;
                    let variantsData = [];
                    
                    if (mainProductId) {
                        // Use cache to avoid redundant LS API calls for variants of the same product
                        if (lsProductDetailsCache.has(mainProductId)) {
                            variantsData = lsProductDetailsCache.get(mainProductId);
                        } else {
                            try {
                                const fetched = await fetchProductDetails(mainProductId);
                                variantsData = Array.isArray(fetched.variantsData) ? fetched.variantsData.map((v) => ({ ...v })) : [];
                                lsProductDetailsCache.set(mainProductId, variantsData);
                            } catch (fetchErr) {
                                variantsData = Array.isArray(currentDoc.variantsData) ? currentDoc.variantsData.map((v) => ({ ...v })) : [];
                            }
                        }
                    } else {
                        variantsData = Array.isArray(currentDoc.variantsData) ? currentDoc.variantsData.map((v) => ({ ...v })) : [];
                    }

                    const variantIndex = variantsData.findIndex((v) => String(v.id) === String(lightspeedVariantId));
                    if (variantIndex >= 0) {
                        variantsData[variantIndex].qty = updateQty;
                    } else {
                        variantsData.push({ id: lightspeedVariantId, qty: updateQty });
                    }

                    const totalQty = variantsData.reduce((sum, v) => sum + (Number(v.qty) || 0), 0);
                    const productStatus = totalQty > 0;

                    const updatedEntry = await Product.findByIdAndUpdate(
                        mongoObjectId,
                        {
                            $set: { variantsData, totalQty, status: productStatus },
                            $inc: { sold: qtySold },
                        },
                        { new: true }
                    );

                    if (updatedEntry) {
                        const afterDiag = await getDiagnosticInventory(lightspeedVariantId);
                        const qtyMsg = `BEFORE: Lightspeed=${beforeDiag.lightspeedQty} Local=${beforeDiag.localQty} | AFTER: Lightspeed=${afterDiag.lightspeedQty} Local=${afterDiag.localQty} | Expected=${updateQty} QtySold=${item.qty}`;
                        
                        await logActivity({
                            platform: 'Mobile App Backend',
                            log_type: 'backend_activity',
                            action: 'Inventory Update',
                            status: 'success',
                            message: `Product ${name} updated successfully. ${qtyMsg}`,
                            user: null,
                            details: {
                                order_id: orderId,
                                product_id: lightspeedVariantId?.toString?.(),
                                product_name: name,
                                qty_before: { lightspeed: beforeDiag.lightspeedQty, local: beforeDiag.localQty },
                                qty_after: { lightspeed: afterDiag.lightspeedQty, local: afterDiag.localQty },
                                expected_after: updateQty,
                                qty_sold: item.qty,
                                total_before: item.total_qty,
                            }
                        });

                        emailDetails.push({
                            productName: name,
                            variantId: lightspeedVariantId,
                            qtySold: item.qty,
                            qtyRemaining: updateQty,
                            updateStatus: "Successful",
                        });
                        return true;
                    }
                } catch (err) {
                    logger.error({ err, product: name }, "Error updating product quantity");
                }
                
                emailDetails.push({
                    productName: name,
                    variantId: lightspeedVariantId,
                    qtySold: item.qty,
                    qtyRemaining: updateQty,
                    updateStatus: "Failed",
                });
                return false;
            })
        );

        await updateQuantityMail(emailDetails);

        const successCount = updateResults.filter(r => r === true).length;
        const failureCount = updateResults.filter(r => r === false).length;
        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Inventory Update Batch',
            status: successCount > 0 ? 'success' : 'failure',
            message: `Inventory update completed: ${successCount} success, ${failureCount} failed`,
            order_id: orderId,
            execution_path: 'orderController.updateQuantities'
        });

        return updateResults;
    } catch (error) {
        logger.error({ err: error }, "Error in updating quantities for the cart:");
        return [];
    }
}