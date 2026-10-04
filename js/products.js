// =========================================
// CANVO PRODUCTS
// Products are loaded from Cloudflare D1 API
// =========================================

let products = [];


// =========================================
// LOAD PRODUCTS FROM API
// =========================================

async function loadProducts() {

  try {

    const response =
      await fetch(
        "/api/products",
        {
          method: "GET"
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      !data.ok
    ) {

      throw new Error(
        data.error ||
        "Failed to load products."
      );

    }


    /*
     * Convert database field names
     * to the format used by the
     * existing frontend.
     */

    products =
      (data.products || [])
        .map(product => ({

          id:
            Number(product.id),

          name:
            product.name,

          category:
            product.category,

          price:
            Number(product.price),

          oldPrice:
            product.old_price !== null
              ? Number(product.old_price)
              : null,

          image:
            product.image_url || "",

          /*
           * Badge is not stored in the
           * database yet.
           */
          badge:
            ""

        }));


    return products;


  } catch (error) {

    console.error(
      "Product API error:",
      error
    );


    products = [];


    return [];

  }

}
