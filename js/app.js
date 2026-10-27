// ========================================================
// CANVO — CUSTOMER APP
// Product API + Product Details + Variants + Cart
// ========================================================

// ========================================================
// PRODUCT DETAILS STATE
// ========================================================

let selectedProduct = null;
let selectedProductVariants = [];
let selectedSize = null;
let selectedColor = null;
let selectedVariant = null;
let detailQuantity = 1;
let activeHomeCategory = "";


// ========================================================
// DOM READY
// ========================================================

document.addEventListener("DOMContentLoaded", () => {
  initializeStore();
});


// ========================================================
// INITIALIZE STORE
// ========================================================

async function initializeStore() {

  await loadProducts();

  /*
   * CANVO uses two page types:
   * 1. Store pages with #productGrid
   * 2. Dedicated product page with #productPage
   */

  const productPage =
    document.getElementById("productPage");

  if (productPage) {

    await initializeProductPage();

  } else {

    renderProducts();

  }

  updateCount();

}


// ========================================================
// LOAD PRODUCTS FROM D1 API
// ========================================================

async function loadProducts() {

  try {

    const response =
      await fetch("/api/products", {
        method: "GET"
      });

    const data =
      await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error ||
        "Failed to load products."
      );
    }

    products =
      (data.products || [])
        .map(product => ({

          id: Number(product.id),

          name: product.name,

          category: product.category,

          price: Number(product.price),

          oldPrice:
            product.old_price !== null
              ? Number(product.old_price)
              : null,

          image:
            product.image_url || "",

          images:
            Array.isArray(product.images)
              ? product.images
                  .slice()
                  .sort((a, b) => {

                    const mainDiff =
                      Number(b?.is_main || 0) -
                      Number(a?.is_main || 0);

                    if (mainDiff !== 0) {
                      return mainDiff;
                    }

                    const orderDiff =
                      Number(a?.sort_order || 0) -
                      Number(b?.sort_order || 0);

                    if (orderDiff !== 0) {
                      return orderDiff;
                    }

                    return Number(a?.id || 0) -
                      Number(b?.id || 0);

                  })
                  .filter(image =>
                    image &&
                    image.image_url
                  )
              : [],

          description:
            product.description || ""

        }));

  } catch (error) {

    console.error(
      "Product API error:",
      error
    );

    products = [];

  }

}



// ========================================================
// HOMEPAGE CATEGORY FILTER
// ========================================================

function showHomeCategory(category = "") {
  activeHomeCategory = String(category || "").trim();

  const heading = document.getElementById("productGridHeading");
  const status = document.getElementById("productFilterStatus");

  if (heading) {
    heading.textContent = activeHomeCategory
      ? `${activeHomeCategory} Collection`
      : "New Arrivals";
  }

  if (status) {
    status.hidden = !activeHomeCategory;
    status.textContent = activeHomeCategory
      ? `Showing only ${activeHomeCategory.toLowerCase()} products.`
      : "";
  }

  renderProducts(products);

  const grid = document.getElementById("new-arrivals");
  if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ========================================================
// RENDER PRODUCTS
// ========================================================

function renderProducts(list = null) {

  const grid =
    document.getElementById("productGrid");

  if (!grid) return;

  const sourceProducts = Array.isArray(list) ? list : products;
  const visibleProducts = activeHomeCategory
    ? sourceProducts.filter(product =>
        String(product.category || "").trim().toLowerCase().replace(/s$/, "") ===
        activeHomeCategory.trim().toLowerCase().replace(/s$/, "")
      )
    : sourceProducts;

  list = visibleProducts;

  if (!list.length) {

    grid.innerHTML = `
      <div style="
        grid-column:1/-1;
        text-align:center;
        padding:60px 20px;
        color:#777;
      ">
        No products available.
      </div>
    `;

    return;
  }

  grid.innerHTML =
    list.map(product => {

      const oldPrice =
        product.oldPrice !== null
          ? `
            <span class="old-price">
              ৳${formatPrice(product.oldPrice)}
            </span>
          `
          : "";

      return `
        <article
          class="product-card"
          data-product-id="${product.id}"
        >

          <div
            class="product-image"
            onclick="goToProduct(${product.id})"
            style="cursor:pointer;"
          >

            <img
              src="${escapeHtml(product.image)}"
              alt="${escapeHtml(product.name)}"
              loading="lazy"
            >

          </div>

          <div class="product-info">

            <p class="product-category">
              ${escapeHtml(product.category || "")}
            </p>

            <h3
              onclick="goToProduct(${product.id})"
              style="cursor:pointer;"
            >
              ${escapeHtml(product.name)}
            </h3>

            <div class="product-price">

  <strong>
    ৳${formatPrice(product.price)}
  </strong>

  ${oldPrice}

  ${
    product.oldPrice !== null &&
    Number(product.oldPrice) > Number(product.price)
      ? `
        <span class="discount-amount">
          Save ৳${formatPrice(
            Number(product.oldPrice) -
            Number(product.price)
          )}
        </span>
      `
      : ""
  }

</div>

            <button
              class="add-btn home-add-to-cart"
              type="button"
              data-product-id="${Number(product.id)}"
              onclick="handleHomeAddToCart(${Number(product.id)})"
            >
              ADD TO CART
            </button>

          </div>

        </article>
      `;

    }).join("");

}


// ========================================================
// HOMEPAGE ADD TO CART
// ========================================================
// Products with one simple, option-free variant can be added directly.
// If size/color or multiple variants must be chosen, take the customer to
// the product page so the correct variant is selected before adding.
async function handleHomeAddToCart(productId) {
  const id = Number(productId);
  const product = products.find(item => Number(item.id) === id);

  if (!Number.isInteger(id) || id <= 0 || !product) {
    showToast("This product could not be found. Please refresh and try again.");
    return;
  }

  const buttons = document.querySelectorAll(`.home-add-to-cart[data-product-id="${id}"]`);
  buttons.forEach(button => {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = "CHECKING...";
  });

  try {
    const response = await fetch(`/api/products/${encodeURIComponent(id)}/variants`, {
      method: "GET",
      headers: { "Accept": "application/json" },
      cache: "no-store"
    });
    const data = await response.json();

    if (!response.ok || !data.ok || !Array.isArray(data.variants)) {
      throw new Error(data.error || "Could not check product availability.");
    }

    const availableVariants = data.variants.filter(variant => Number(variant.stock_quantity) > 0);

    if (!availableVariants.length) {
      showToast("This product is currently out of stock.");
      return;
    }

    const hasOptions = variant =>
      String(variant.size ?? "").trim() !== "" ||
      String(variant.color ?? "").trim() !== "";

    // Only auto-add when there is exactly one unambiguous variant.
    if (availableVariants.length !== 1 || hasOptions(availableVariants[0])) {
      showToast("Please select your size and color to add this product.");
      goToProduct(id);
      return;
    }

    const variant = availableVariants[0];
    const stock = Number(variant.stock_quantity);
    const cart = getCart();
    const existingIndex = cart.findIndex(item =>
      Number(item.productId) === id && Number(item.variantId) === Number(variant.id)
    );

    if (existingIndex >= 0) {
      const nextQuantity = Number(cart[existingIndex].quantity || 0) + 1;
      if (nextQuantity > stock) {
        showToast(`Only ${stock} available for this product.`);
        return;
      }
      cart[existingIndex].quantity = nextQuantity;
    } else {
      cart.push({
        productId: id,
        variantId: Number(variant.id),
        name: product.name,
        price: Number(product.price),
        image: product.image || "",
        size: variant.size || "",
        color: variant.color || "",
        sku: variant.sku || "",
        quantity: 1
      });
    }

    saveCart(cart);
    updateCount();
    showToast(`${product.name} added to cart.`);
  } catch (error) {
    console.error("Homepage add-to-cart error:", error);
    showToast("Could not add this product right now. Opening product details instead.");
    goToProduct(id);
  } finally {
    buttons.forEach(button => {
      button.disabled = false;
      button.textContent = "ADD TO CART";
    });
  }
}


// ========================================================
// PRODUCT PAGE NAVIGATION
// ========================================================

function goToProduct(productId) {

  const id = Number(productId);

  if (!id) {
    showToast("Product not found.");
    return;
  }

  window.location.href =
    `product.html?id=${encodeURIComponent(id)}`;

}


// ========================================================
// OPEN PRODUCT DETAILS — COMPATIBILITY REDIRECT
// ========================================================

function openProductDetails(productId) {

  goToProduct(productId);

}


// ========================================================
// INITIALIZE DEDICATED PRODUCT PAGE
// ========================================================

async function initializeProductPage() {

  const params =
    new URLSearchParams(window.location.search);

  const productId =
    Number(params.get("id"));

  if (!productId) {

    showProductPageMessage(
      "Product not found.",
      "Please return to the shop and select a product."
    );

    return;
  }

  const product =
    products.find(
      item => Number(item.id) === productId
    );

  if (!product) {

    showProductPageMessage(
      "Product not found.",
      "This product may no longer be available."
    );

    return;
  }

  selectedProduct =
    product;

  selectedProductVariants =
    [];

  selectedSize =
    null;

  selectedColor =
    null;

  selectedVariant =
    null;

  detailQuantity =
    1;

  // --------------------------------------------
  // Product information
  // --------------------------------------------

  const image =
    document.getElementById(
      "detailProductImage"
    );

  const category =
    document.getElementById(
      "detailProductCategory"
    );

  const name =
    document.getElementById(
      "detailProductName"
    );

  const price =
    document.getElementById(
      "detailProductPrice"
    );

  const oldPrice =
    document.getElementById(
      "detailProductOldPrice"
    );

  const description =
    document.getElementById(
      "detailProductDescription"
    );

  if (image) {

    image.src =
      product.image || "";

    image.alt =
      product.name || "";

  }

  if (category) {

    category.textContent =
      product.category || "";

  }

  if (name) {

    name.textContent =
      product.name || "";

  }

  if (price) {

    price.textContent =
      `৳${formatPrice(product.price)}`;

  }

  if (oldPrice) {

    if (product.oldPrice !== null) {

      oldPrice.textContent =
        `৳${formatPrice(product.oldPrice)}`;

      oldPrice.style.display =
        "inline";

    } else {

      oldPrice.textContent =
        "";

      oldPrice.style.display =
        "none";

    }

  }

  if (description) {

    description.textContent =
      product.description ||
      "Premium quality product from CANVO.";

  }

  const breadcrumbName =
    document.getElementById(
      "productBreadcrumbName"
    );

  if (breadcrumbName) {

    breadcrumbName.textContent =
      product.name || "Product";

  }

  // --------------------------------------------
  // Page title
  // --------------------------------------------

  document.title =
    `${product.name} | CANVO`;

  // --------------------------------------------
  // Gallery
  // --------------------------------------------

  renderProductGallery(
    product
  );

  // --------------------------------------------
  // Reset quantity
  // --------------------------------------------

  detailQuantity =
    1;

  updateDetailQuantityDisplay();

  // --------------------------------------------
  // Loading state
  // --------------------------------------------

  setDetailLoadingState();

  // --------------------------------------------
  // Load variants
  // --------------------------------------------

  await loadProductVariants(
    product.id
  );

}


// ========================================================
// PRODUCT PAGE ERROR MESSAGE
// ========================================================

function showProductPageMessage(
  title,
  message
) {

  const page =
    document.getElementById(
      "productPage"
    );

  if (!page) return;

  page.innerHTML = `
    <div class="product-page-message">

      <h1>
        ${escapeHtml(title)}
      </h1>

      <p>
        ${escapeHtml(message)}
      </p>

      <a
        href="index.html"
        class="product-back-button"
      >
        BACK TO SHOP
      </a>

    </div>
  `;

}


// ========================================================
// PRODUCT IMAGE GALLERY
// ========================================================

function getProductGalleryImages(
  product
) {

  if (!product) {
    return [];
  }

  const images =
    Array.isArray(product.images)
      ? product.images
          .slice()
          .sort((a, b) => {

            const mainDiff =
              Number(b?.is_main || 0) -
              Number(a?.is_main || 0);

            if (mainDiff !== 0) {
              return mainDiff;
            }

            const orderDiff =
              Number(a?.sort_order || 0) -
              Number(b?.sort_order || 0);

            if (orderDiff !== 0) {
              return orderDiff;
            }

            return Number(a?.id || 0) -
              Number(b?.id || 0);

          })
          .filter(
            image =>
              image &&
              image.image_url
          )
      : [];

  // Fallback to products.image_url
  if (
    !images.length &&
    product.image
  ) {

    return [
      {
        id: 0,
        image_url: product.image,
        sort_order: 1,
        is_main: 1
      }
    ];

  }

  return images;

}


// ========================================================
// RENDER PRODUCT GALLERY
// ========================================================

function renderProductGallery(
  product
) {

  const image =
    document.getElementById(
      "detailProductImage"
    );

  const thumbnails =
    document.getElementById(
      "productThumbnails"
    );

  if (!image) {
    return;
  }

  const galleryImages =
    getProductGalleryImages(
      product
    );

  if (!galleryImages.length) {
    return;
  }

  // --------------------------------------------
  // Set main image
  // --------------------------------------------

  image.src =
    galleryImages[0].image_url;

  image.alt =
    `${product.name || "Product"} image 1`;

  // --------------------------------------------
  // Render thumbnails
  // --------------------------------------------

  if (!thumbnails) {
    return;
  }

  thumbnails.innerHTML =
    "";

  galleryImages.forEach(
    (galleryImage, index) => {

      const button =
        document.createElement(
          "button"
        );

      button.type =
        "button";

      button.className =
        "canvo-product-thumbnail";

      button.setAttribute(
        "aria-label",
        `View image ${index + 1}`
      );

      const thumb =
        document.createElement(
          "img"
        );

      thumb.src =
        galleryImage.image_url;

      thumb.alt =
        `${product.name || "Product"} image ${index + 1}`;

      thumb.loading =
        index === 0
          ? "eager"
          : "lazy";

      button.appendChild(
        thumb
      );

      if (index === 0) {

        button.classList.add(
          "active"
        );

      }

      button.addEventListener(
        "click",
        () => {

          image.src =
            galleryImage.image_url;

          image.alt =
            `${product.name || "Product"} image ${index + 1}`;

          thumbnails
            .querySelectorAll(
              ".canvo-product-thumbnail"
            )
            .forEach(
              thumbnail =>
                thumbnail.classList.remove(
                  "active"
                )
            );

          button.classList.add(
            "active"
          );

        }
      );

      thumbnails.appendChild(
        button
      );

    }
  );

}


// ========================================================
// LOAD PRODUCT VARIANTS
// ========================================================

async function loadProductVariants(productId) {

  try {

    const response =
      await fetch(
        `/api/products/${productId}/variants`,
        {
          method: "GET"
        }
      );

    const data =
      await response.json();

    if (!response.ok || !data.ok) {

      throw new Error(
        data.error ||
        "Failed to load variants."
      );

    }

    selectedProductVariants =
      data.variants || [];

    renderVariantOptions();

    updateVariantSelection();

  } catch (error) {

    console.error(
      "Variant API error:",
      error
    );

    selectedProductVariants = [];

    renderVariantOptions();

    const stock =
      document.getElementById(
        "detailStock"
      );

    if (stock) {

      stock.textContent =
        "Unable to load product variants.";

      stock.className =
        "detail-stock out-of-stock";

    }

  }

}


// ========================================================
// RENDER SIZE + COLOR OPTIONS
// ========================================================

function renderVariantOptions() {

  const sizeOptions =
    document.getElementById(
      "sizeOptions"
    );

  const colorOptions =
    document.getElementById(
      "colorOptions"
    );

  const sizeSection =
    document.getElementById(
      "sizeSection"
    );

  const colorSection =
    document.getElementById(
      "colorSection"
    );

  // --------------------------------------------
  // Sizes
  // --------------------------------------------

  const sizes =
    [...new Set(
      selectedProductVariants
        .map(variant => variant.size)
        .filter(value =>
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ""
        )
        .map(value => String(value))
    )];

  // --------------------------------------------
  // Colors
  // --------------------------------------------

  const colors =
    [...new Set(
      selectedProductVariants
        .map(variant => variant.color)
        .filter(value =>
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ""
        )
        .map(value => String(value))
    )];

  // --------------------------------------------
  // Size section
  // --------------------------------------------

  if (sizeOptions) {

    sizeOptions.innerHTML =
      sizes.map(size => {

        const available =
          selectedProductVariants.some(
            variant =>
              String(variant.size) === String(size) &&
              Number(variant.stock_quantity) > 0
          );

        return `
          <button
            type="button"
            class="variant-option ${available ? "" : "disabled"}"
            ${available ? "" : "disabled"}
            onclick="selectSize('${escapeJs(size)}')"
          >
            ${escapeHtml(size)}
          </button>
        `;

      }).join("");

  }

  if (sizeSection) {

    sizeSection.style.display =
      sizes.length
        ? "block"
        : "none";

  }

  // --------------------------------------------
  // Color section
  // --------------------------------------------

  if (colorOptions) {

    colorOptions.innerHTML =
      colors.map(color => {

        const available =
          selectedProductVariants.some(
            variant =>
              String(variant.color) === String(color) &&
              Number(variant.stock_quantity) > 0
          );

        return `
          <button
            type="button"
            class="variant-option ${available ? "" : "disabled"}"
            ${available ? "" : "disabled"}
            onclick="selectColor('${escapeJs(color)}')"
          >
            ${escapeHtml(color)}
          </button>
        `;

      }).join("");

  }

  if (colorSection) {

    colorSection.style.display =
      colors.length
        ? "block"
        : "none";

  }

}


// ========================================================
// SELECT SIZE
// ========================================================

function selectSize(size) {

  selectedSize =
    String(size);

  updateVariantSelection();

}


// ========================================================
// SELECT COLOR
// ========================================================

function selectColor(color) {

  selectedColor =
    String(color);

  updateVariantSelection();

}


// ========================================================
// UPDATE VARIANT SELECTION
// ========================================================

function updateVariantSelection() {

  const sizeText =
    document.getElementById(
      "selectedSizeText"
    );

  const colorText =
    document.getElementById(
      "selectedColorText"
    );

  if (sizeText) {

    sizeText.textContent =
      selectedSize
        ? selectedSize
        : "Select";

  }

  if (colorText) {

    colorText.textContent =
      selectedColor
        ? selectedColor
        : "Select";

  }

  // --------------------------------------------
  // Highlight selected size
  // --------------------------------------------

  document
    .querySelectorAll(
      "#sizeOptions .variant-option"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.textContent.trim() ===
        String(selectedSize || "")
      );

    });

  // --------------------------------------------
  // Highlight selected color
  // --------------------------------------------

  document
    .querySelectorAll(
      "#colorOptions .variant-option"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.textContent.trim() ===
        String(selectedColor || "")
      );

    });

  // --------------------------------------------
  // Find exact variant
  // --------------------------------------------

  selectedVariant =
    findMatchingVariant();

  updateDetailStock();

  updateDetailAddButton();

}


// ========================================================
// FIND MATCHING VARIANT
// ========================================================

function findMatchingVariant() {

  if (!selectedProductVariants.length) {

    return null;

  }

  return (
    selectedProductVariants.find(
      variant => {

        const sizeMatches =
          !selectedSize ||
          String(variant.size) ===
          String(selectedSize);

        const colorMatches =
          !selectedColor ||
          String(variant.color) ===
          String(selectedColor);

        return (
          sizeMatches &&
          colorMatches
        );

      }
    ) || null
  );

}


// ========================================================
// UPDATE DETAIL STOCK
// ========================================================

function updateDetailStock() {

  const stock =
    document.getElementById(
      "detailStock"
    );

  if (!stock) return;

  stock.className =
    "detail-stock";

  // No variants
  if (!selectedProductVariants.length) {

    stock.textContent =
      "Currently unavailable.";

    stock.classList.add(
      "out-of-stock"
    );

    return;
  }

  // Need size
  if (
    hasSizes() &&
    !selectedSize
  ) {

    stock.textContent =
      "Please select a size.";

    return;
  }

  // Need color
  if (
    hasColors() &&
    !selectedColor
  ) {

    stock.textContent =
      "Please select a color.";

    return;
  }

  // Exact variant unavailable
  if (!selectedVariant) {

    stock.textContent =
      "This combination is unavailable.";

    stock.classList.add(
      "out-of-stock"
    );

    return;
  }

  const quantity =
    Number(
      selectedVariant.stock_quantity
    );

  if (quantity <= 0) {

    stock.textContent =
      "Out of stock.";

    stock.classList.add(
      "out-of-stock"
    );

    return;
  }

  if (quantity <= 5) {

    stock.textContent =
      `Only ${quantity} left in stock.`;

  } else {

    stock.textContent =
      `${quantity} available in stock.`;

  }

  stock.classList.add(
    "in-stock"
  );

}


// ========================================================
// UPDATE ADD TO CART BUTTON
// ========================================================

function updateDetailAddButton() {

  const button =
    document.getElementById(
      "detailAddToCart"
    );

  const buyNowButton =
    document.getElementById(
      "detailBuyNow"
    );

  if (!button) return;

  button.disabled = true;

  if (buyNowButton) {
    buyNowButton.disabled = true;
  }

  // No variants
  if (!selectedProductVariants.length) {

    button.textContent =
      "OUT OF STOCK";

    return;
  }

  // Size required
  if (
    hasSizes() &&
    !selectedSize
  ) {

    button.textContent =
      "SELECT SIZE";

    return;
  }

  // Color required
  if (
    hasColors() &&
    !selectedColor
  ) {

    button.textContent =
      "SELECT COLOR";

    return;
  }

  // Variant not found
  if (!selectedVariant) {

    button.textContent =
      "UNAVAILABLE";

    if (buyNowButton) {

      buyNowButton.disabled = true;

      buyNowButton.textContent =
        "UNAVAILABLE";

    }

    return;
  }

  const stock =
    Number(
      selectedVariant.stock_quantity
    );

  if (stock <= 0) {

    button.disabled = true;

    button.textContent =
      "OUT OF STOCK";

    if (buyNowButton) {

      buyNowButton.disabled = true;

      buyNowButton.textContent =
        "OUT OF STOCK";

    }

    return;
  }

  button.disabled = false;

  button.textContent =
    "ADD TO CART";

  if (buyNowButton) {

    buyNowButton.disabled = false;

    buyNowButton.textContent =
      "BUY NOW";

  }

}


// ========================================================
// CHECK WHETHER PRODUCT HAS SIZES
// ========================================================

function hasSizes() {

  return selectedProductVariants.some(
    variant =>
      variant.size !== null &&
      variant.size !== undefined &&
      String(variant.size).trim() !== ""
  );

}


// ========================================================
// CHECK WHETHER PRODUCT HAS COLORS
// ========================================================

function hasColors() {

  return selectedProductVariants.some(
    variant =>
      variant.color !== null &&
      variant.color !== undefined &&
      String(variant.color).trim() !== ""
  );

}


// ========================================================
// QUANTITY — INCREASE
// ========================================================

function increaseDetailQuantity() {

  if (!selectedVariant) {

    showToast(
      "Please select size and color first."
    );

    return;
  }

  const stock =
    Number(
      selectedVariant.stock_quantity
    );

  if (detailQuantity >= stock) {

    showToast(
      `Only ${stock} available.`
    );

    return;
  }

  detailQuantity++;

  updateDetailQuantityDisplay();

}


// ========================================================
// QUANTITY — DECREASE
// ========================================================

function decreaseDetailQuantity() {

  if (detailQuantity <= 1) {

    return;
  }

  detailQuantity--;

  updateDetailQuantityDisplay();

}


// ========================================================
// UPDATE QUANTITY DISPLAY
// ========================================================

function updateDetailQuantityDisplay() {

  const quantity =
    document.getElementById(
      "detailQuantity"
    );

  if (quantity) {

    quantity.textContent =
      String(detailQuantity);

  }

}


// ========================================================
// ADD SELECTED VARIANT TO CART
// ========================================================

function addSelectedVariantToCart() {

  if (!selectedProduct) {

    return;

  }

  if (!selectedVariant) {

    showToast(
      "Please select a valid size and color."
    );

    return;
  }

  const stock =
    Number(
      selectedVariant.stock_quantity
    );

  if (stock <= 0) {

    showToast(
      "This variant is out of stock."
    );

    return;
  }

  if (detailQuantity > stock) {

    showToast(
      `Only ${stock} available.`
    );

    return;
  }

  // --------------------------------------------
  // Get existing cart
  // --------------------------------------------

  let cart =
    getCart();

  // --------------------------------------------
  // Variant-specific cart item
  // --------------------------------------------

  const existingIndex =
    cart.findIndex(
      item =>
        Number(item.productId) ===
          Number(selectedProduct.id) &&
        Number(item.variantId) ===
          Number(selectedVariant.id)
    );

  if (existingIndex !== -1) {

    const newQuantity =
      Number(
        cart[existingIndex].quantity || 0
      ) + detailQuantity;

    if (newQuantity > stock) {

      showToast(
        `Only ${stock} available for this variant.`
      );

      return;
    }

    cart[existingIndex].quantity =
      newQuantity;

  } else {

    cart.push({

      productId:
        Number(selectedProduct.id),

      variantId:
        Number(selectedVariant.id),

      name:
        selectedProduct.name,

      price:
        Number(selectedProduct.price),

        oldPrice:
    selectedProduct.oldPrice !== null
      ? Number(selectedProduct.oldPrice)
      : null,

      image:
        selectedProduct.image,

      size:
        selectedVariant.size || "",

      color:
        selectedVariant.color || "",

      sku:
        selectedVariant.sku || "",

      quantity:
        detailQuantity

    });

  }

  saveCart(cart);

  updateCount();

  showToast(
    `${selectedProduct.name} added to cart.`
  );

  closeProductDetails();

}


// ========================================================
// CLOSE PRODUCT DETAILS — COMPATIBILITY
// ========================================================

function closeProductDetails() {
  // Close any legacy homepage product modal safely.
  // Older modal markup is still present on index.html, so a no-op here
  // can leave its overlay on top of the page and make scrolling feel frozen.
  const modal = document.getElementById("productModal");

  if (modal) {
    modal.classList.remove("active", "show", "open");
    modal.setAttribute("aria-hidden", "true");
    modal.style.display = "none";
  }

  // Restore page scrolling after the modal has been dismissed.
  if (!document.getElementById("cartPanel")?.classList.contains("active")) {
    document.body.style.overflow = "";
    document.body.classList.remove("modal-open");
  }
}


// ========================================================
// DETAIL LOADING STATE
// ========================================================

function setDetailLoadingState() {

  const sizeOptions =
    document.getElementById(
      "sizeOptions"
    );

  const colorOptions =
    document.getElementById(
      "colorOptions"
    );

  const stock =
    document.getElementById(
      "detailStock"
    );

  const button =
    document.getElementById(
      "detailAddToCart"
    );

  if (sizeOptions) {

    sizeOptions.innerHTML =
      `<span style="font-size:11px;color:#777;">
        Loading...
      </span>`;

  }

  if (colorOptions) {

    colorOptions.innerHTML =
      `<span style="font-size:11px;color:#777;">
        Loading...
      </span>`;

  }

  if (stock) {

    stock.className =
      "detail-stock";

    stock.textContent =
      "Loading available variants...";

  }

  if (button) {

    button.disabled =
      true;

    button.textContent =
      "LOADING...";

  }

}


// ========================================================
// CART
// ========================================================

function getCart() {

  try {

    const saved =
      localStorage.getItem(
        "canvoCart"
      );

    if (!saved) {

      return [];

    }

    const cart =
      JSON.parse(saved);

    return Array.isArray(cart)
      ? cart
      : [];

  } catch (error) {

    console.error(
      "Cart read error:",
      error
    );

    return [];

  }

}


// ========================================================
// SAVE CART
// ========================================================

function saveCart(cart) {

  localStorage.setItem(
    "canvoCart",
    JSON.stringify(cart)
  );

  renderCart();

}


// ========================================================
// UPDATE CART COUNT
// ========================================================

function updateCount() {

  const cart =
    getCart();

  const count =
    cart.reduce(
      (total, item) =>
        total +
        Number(item.quantity || 0),
      0
    );

  document
    .querySelectorAll(
      ".cart-count"
    )
    .forEach(element => {

      element.textContent =
        String(count);

    });

  // Support alternative ID
  const cartCount =
    document.getElementById(
      "cartCount"
    );

  if (cartCount) {

    cartCount.textContent =
      String(count);

  }

}


// ========================================================
// RENDER CART
// ========================================================

function renderCart() {

  const cart =
    getCart();

  const cartItems =
    document.getElementById(
      "cartItems"
    );

  const cartTotal =
    document.getElementById(
      "cartTotal"
    );

  // ------------------------------------------------------
  // Cart container not available
  // ------------------------------------------------------

  if (!cartItems) {

    updateCount();

    return;

  }


  // ------------------------------------------------------
  // Empty cart
  // ------------------------------------------------------

  if (!cart.length) {

    cartItems.innerHTML = `
      <div
        style="
          text-align: center;
          padding: 30px 10px;
          color: #777;
        "
      >
        Your cart is empty.
      </div>
    `;

    if (cartTotal) {

      cartTotal.textContent =
        "৳0";

    }

    updateCount();

    return;

  }


  // ------------------------------------------------------
  // Calculate total
  // ------------------------------------------------------

  let total = 0;


  // ------------------------------------------------------
  // Render cart items
  // ------------------------------------------------------

  cartItems.innerHTML =
    cart.map(
      (item, index) => {

        const quantity =
          Number(
            item.quantity || 0
          );

        const price =
          Number(
            item.price || 0
          );

        total +=
          price * quantity;


        return `
          <div class="cart-item">

            <!-- PRODUCT NAME -->
            <strong class="cart-item-name">
              ${escapeHtml(
                item.name || ""
              )}
            </strong>


            <!-- IMAGE + DETAILS -->
            <div class="cart-item-body">

              <img
                src="${escapeHtml(
                  item.image || ""
                )}"
                alt="${escapeHtml(
                  item.name || ""
                )}"
              >


              <!-- PRODUCT DETAILS -->
              <div class="cart-item-info">

                ${
                  item.size
                    ? `
                      <div class="cart-detail">
                        Size:
                        ${escapeHtml(
                          item.size
                        )}
                      </div>
                    `
                    : ""
                }


                ${
                  item.color
                    ? `
                      <div class="cart-detail">
                        Color:
                        ${escapeHtml(
                          item.color
                        )}
                      </div>
                    `
                    : ""
                }


                <div class="cart-detail">
                  ৳${formatPrice(price)}
                </div>


                <!-- QUANTITY + REMOVE -->
                <div
                  class="cart-item-actions"
                >

                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onclick="
                      changeCartQuantity(
                        ${index},
                        -1
                      )
                    "
                  >
                    −
                  </button>


                  <span>
                    ${quantity}
                  </span>


                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onclick="
                      changeCartQuantity(
                        ${index},
                        1
                      )
                    "
                  >
                    +
                  </button>


                  <button
                    type="button"
                    onclick="
                      removeFromCart(
                        ${index}
                      )
                    "
                  >
                    Remove
                  </button>

                </div>

              </div>

            </div>

          </div>
        `;

      }
    ).join("");


  // ------------------------------------------------------
  // Update cart total
  // ------------------------------------------------------

  if (cartTotal) {

    cartTotal.textContent =
      `৳${formatPrice(total)}`;

  }


  // ------------------------------------------------------
  // Update cart count
  // ------------------------------------------------------

  updateCount();

}


// ========================================================
// CHANGE CART QUANTITY
// ========================================================

function changeCartQuantity(
  index,
  change
) {

  const cart =
    getCart();

  if (!cart[index]) return;

  const newQuantity =
    Number(
      cart[index].quantity || 0
    ) + Number(change);

  if (newQuantity <= 0) {

    cart.splice(index, 1);

  } else {

    cart[index].quantity =
      newQuantity;

  }

  saveCart(cart);

  renderCart();

  updateCount();

}


// ========================================================
// REMOVE FROM CART
// ========================================================

function removeFromCart(index) {

  const cart =
    getCart();

  if (!cart[index]) return;

  cart.splice(index, 1);

  saveCart(cart);

  renderCart();

  updateCount();

  showToast(
    "Item removed from cart."
  );

}

// ========================================================
// OPEN CART
// ========================================================

function openCart() {
  const cart = document.getElementById("cartPanel");
  if (!cart) {
    showToast("Cart panel is unavailable. Please refresh the page.");
    return;
  }

  // Do not lock the document scroll; the cart drawer has its own scroll area.
  document.body.classList.remove("cart-open", "modal-open");
  document.body.style.overflow = "";
  cart.classList.add("active");
  cart.setAttribute("aria-hidden", "false");
  renderCart();

  const closeButton = cart.querySelector(".cart-head button");
  if (closeButton) closeButton.focus({ preventScroll: true });
}


// ========================================================
// CLOSE CART
// ========================================================

function closeCart() {
  const cart = document.getElementById("cartPanel");
  if (!cart) return;

  cart.classList.remove("active");
  cart.setAttribute("aria-hidden", "true");
  document.body.classList.remove("cart-open");
  document.body.style.overflow = "";
}


// ========================================================
// SEARCH
// ========================================================

function searchProducts() {
  const input = document.getElementById("searchInput");
  const results = document.getElementById("searchResults");
  if (!input || !results) return;

  const query = input.value.trim().toLowerCase();
  const matches = !query
    ? products.slice(0, 5)
    : products.filter(product => {
        const name = String(product.name || "").toLowerCase();
        const category = String(product.category || "").toLowerCase();
        const description = String(product.description || "").toLowerCase();
        return name.includes(query) || category.includes(query) || description.includes(query);
      }).slice(0, 10);

  if (!matches.length) {
    results.innerHTML = '<div class="search-empty">No matching products found. Try another name or category.</div>';
    return;
  }

  results.innerHTML = matches.map(product => `
    <button type="button" class="search-result-item" onclick="selectSearchResult(${Number(product.id)})">
      <img src="${escapeHtml(product.image || "")}" alt="${escapeHtml(product.name || "Product")}" loading="lazy" onerror="this.style.visibility='hidden'">
      <span class="search-result-copy">
        <span class="search-result-name">${escapeHtml(product.name || "Product")}</span>
        <span class="search-result-meta">${escapeHtml(product.category || "Fashion")} · ৳${formatPrice(product.price)}</span>
      </span>
    </button>
  `).join("");
}

function selectSearchResult(productId) {
  closeSearch();
  goToProduct(Number(productId));
}


// ========================================================
// NEWSLETTER
// ========================================================

function subscribeNewsletter(event) {

  if (event) {

    event.preventDefault();

  }

  showToast(
    "Thank you for subscribing."
  );

}


// ========================================================
// CHECKOUT PLACEHOLDER
// ========================================================

function checkout() {

  const cart = getCart();

  if (!cart.length) {
    showToast("Your cart is empty.");
    return;
  }

  window.location.href =
    "checkout.html";
}


// ========================================================
// TOAST
// ========================================================

function showToast(message) {

  let toast =
    document.getElementById(
      "toast"
    );

  if (!toast) {

    toast =
      document.createElement(
        "div"
      );

    toast.id =
      "toast";

    toast.className =
      "toast";

    document.body.appendChild(
      toast
    );

  }

  toast.textContent =
    message;

  toast.classList.add(
    "show"
  );

  clearTimeout(
    window.canvoToastTimer
  );

  window.canvoToastTimer =
    setTimeout(
      () => {

        toast.classList.remove(
          "show"
        );

      },
      2500
    );

}


// ========================================================
// PRICE FORMAT
// ========================================================

function formatPrice(price) {

  return Number(
    price || 0
  ).toLocaleString(
    "en-US"
  );

}


// ========================================================
// ESCAPE HTML
// ========================================================

function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


// ========================================================
// ESCAPE JAVASCRIPT STRING
// ========================================================

function escapeJs(value) {

  return String(
    value ?? ""
  )
    .replace(
      /\\/g,
      "\\\\"
    )
    .replace(
      /'/g,
      "\\'"
    )
    .replace(
      /"/g,
      '\\"'
    )
    .replace(
      /\n/g,
      "\\n"
    )
    .replace(
      /\r/g,
      "\\r"
    );

}


// ========================================================
// CLOSE MODALS WITH ESC KEY
// ========================================================

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Escape"
    ) {

      closeCart();

      closeSearch();

    }

  }
);


// ========================================================
// HEADER SEARCH
// ========================================================

function openSearch() {

  const modal =
    document.getElementById(
      "searchModal"
    );

  if (!modal) return;

  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
  // Search is a dropdown, not a full-screen modal; keep the page scrollable.
  document.body.style.overflow = "";

  const input =
    document.getElementById(
      "searchInput"
    );

  if (input) {
    searchProducts();
    setTimeout(() => input.focus({ preventScroll: true }), 50);
  }

}


// ========================================================
// CLOSE SEARCH
// ========================================================

function closeSearch() {

  const modal =
    document.getElementById(
      "searchModal"
    );

  if (!modal) return;

  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
  // Do not unlock/lock the page here: the cart or another dialog may be active.
  document.body.style.overflow = "";

}


// ========================================================
// MOBILE MENU
// ========================================================

function toggleMenu() {

  const nav =
    document.getElementById(
      "nav"
    );

  if (!nav) return;

  nav.classList.toggle(
    "active"
  );

}


// ========================================================
// NEWSLETTER COMPATIBILITY
// ========================================================

function subscribe(event) {

  if (event) {

    event.preventDefault();

  }

  showToast(
    "Thank you for subscribing."
  );

}


// ========================================================
// WISHLIST
// ========================================================

function openWishlist() {

  showToast(
    "Wishlist will be available soon."
  );

}


// ========================================================
// BUY NOW
// ========================================================

function buyNowSelectedVariant() {

  if (!selectedProduct) {
    return;
  }

  if (!selectedVariant) {

    showToast(
      "Please select a valid size and color."
    );

    return;
  }

  const stock =
    Number(
      selectedVariant.stock_quantity
    );

  if (stock <= 0) {

    showToast(
      "This variant is out of stock."
    );

    return;
  }

  if (detailQuantity > stock) {

    showToast(
      `Only ${stock} available.`
    );

    return;
  }

  const buyNowItem = {

    productId:
      Number(selectedProduct.id),

    variantId:
      Number(selectedVariant.id),

    name:
      selectedProduct.name,

    price:
      Number(selectedProduct.price),

    image:
      selectedProduct.image,

    size:
      selectedVariant.size || "",

    color:
      selectedVariant.color || "",

    sku:
      selectedVariant.sku || "",

    quantity:
      Number(detailQuantity)

  };

  // Save only this product for Buy Now
  localStorage.setItem(
    "canvoBuyNow",
    JSON.stringify([
      buyNowItem
    ])
  );

  // Go to checkout
  window.location.href =
    "checkout.html?buyNow=1";

}


// ========================================================
// HOMEPAGE INTERACTIONS: CATEGORY FILTER + CART ESCAPE
// ========================================================
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".category-card[data-category]").forEach(card => {
    card.addEventListener("click", event => {
      event.preventDefault();
      showHomeCategory(card.dataset.category || "");
      history.replaceState(null, "", "#new-arrivals");
    });
  });

  document.querySelectorAll("[data-show-all-products]").forEach(link => {
    link.addEventListener("click", () => {
      showHomeCategory("");
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeCart();
  });
});


// Close the search dropdown when clicking outside it.
document.addEventListener("click", event => {
  const modal = document.getElementById("searchModal");
  if (!modal || !modal.classList.contains("active")) return;
  const clickedSearchButton = event.target.closest(".search-action");
  if (!modal.contains(event.target) && !clickedSearchButton) closeSearch();
});
