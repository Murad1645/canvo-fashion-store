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

  renderProducts();

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
// RENDER PRODUCTS
// ========================================================

function renderProducts(list = products) {

  const grid =
    document.getElementById("productGrid");

  if (!grid) return;

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
            onclick="openProductDetails(${product.id})"
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
              onclick="openProductDetails(${product.id})"
              style="cursor:pointer;"
            >
              ${escapeHtml(product.name)}
            </h3>

            <div class="product-price">

              <strong>
                ৳${formatPrice(product.price)}
              </strong>

              ${oldPrice}

            </div>

            <button
              class="add-btn"
              type="button"
              onclick="openProductDetails(${product.id})"
            >
              VIEW DETAILS
            </button>

          </div>

        </article>
      `;

    }).join("");

}


// ========================================================
// OPEN PRODUCT DETAILS
// ========================================================

async function openProductDetails(productId) {

  const product =
    products.find(
      item => Number(item.id) === Number(productId)
    );

  if (!product) {

    showToast("Product not found.");

    return;
  }

  selectedProduct = product;

  selectedProductVariants = [];

  selectedSize = null;

  selectedColor = null;

  selectedVariant = null;

  detailQuantity = 1;

  // --------------------------------------------
  // Fill product information
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

  // --------------------------------------------
  // Reset quantity
  // --------------------------------------------

  const quantity =
    document.getElementById(
      "detailQuantity"
    );

  if (quantity) {

    quantity.textContent =
      "1";

  }

  // --------------------------------------------
  // Show modal
  // --------------------------------------------

  const modal =
    document.getElementById(
      "productModal"
    );

  if (modal) {

    modal.classList.add("active");

    document.body.style.overflow =
      "hidden";

  }

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
// UPDATE ADD TO CART BUTTON
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

  button.disabled = true;

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
// CLOSE PRODUCT DETAILS
// ========================================================

function closeProductDetails() {

  const modal =
    document.getElementById(
      "productModal"
    );

  if (modal) {

    modal.classList.remove(
      "active"
    );

  }

  document.body.style.overflow =
    "";

  selectedProduct =
    null;

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

  if (!cartItems) {

    updateCount();

    return;
  }

  if (!cart.length) {

    cartItems.innerHTML = `
      <div style="
        text-align:center;
        padding:30px 10px;
        color:#777;
      ">
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

  let total = 0;

  cartItems.innerHTML =
    cart.map(
      (item, index) => {

        const quantity =
          Number(item.quantity || 0);

        const price =
          Number(item.price || 0);

        total +=
          price * quantity;

        return `
          <div class="cart-item">

            <img
              src="${escapeHtml(item.image || "")}"
              alt="${escapeHtml(item.name || "")}"
            >

            <div class="cart-item-info">

              <strong>
                ${escapeHtml(item.name || "")}
              </strong>

              ${
                item.size
                  ? `<small>Size: ${escapeHtml(item.size)}</small>`
                  : ""
              }

              ${
                item.color
                  ? `<small>Color: ${escapeHtml(item.color)}</small>`
                  : ""
              }

              <small>
                ৳${formatPrice(price)}
              </small>

              <div class="cart-item-actions">

                <button
                  type="button"
                  onclick="changeCartQuantity(${index}, -1)"
                >
                  −
                </button>

                <span>
                  ${quantity}
                </span>

                <button
                  type="button"
                  onclick="changeCartQuantity(${index}, 1)"
                >
                  +
                </button>

                <button
                  type="button"
                  onclick="removeFromCart(${index})"
                >
                  Remove
                </button>

              </div>

            </div>

          </div>
        `;

      }
    ).join("");

  if (cartTotal) {

    cartTotal.textContent =
      `৳${formatPrice(total)}`;

  }

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

  updateCount();

  showToast(
    "Item removed from cart."
  );

}


// ========================================================
// OPEN CART
// ========================================================

function openCart() {

  const cart =
    document.getElementById(
      "cartPanel"
    );

  if (!cart) return;

  cart.classList.add(
    "active"
  );

  renderCart();

  document.body.style.overflow =
    "hidden";

}


// ========================================================
// CLOSE CART
// ========================================================

function closeCart() {

  const cart =
    document.getElementById(
      "cartPanel"
    );

  if (!cart) return;

  cart.classList.remove(
    "active"
  );

  document.body.style.overflow =
    "";

}


// ========================================================
// SEARCH
// ========================================================

function searchProducts() {

  const input =
    document.getElementById(
      "searchInput"
    );

  if (!input) return;

  const query =
    input.value
      .trim()
      .toLowerCase();

  if (!query) {

    renderProducts();

    return;

  }

  const filtered =
    products.filter(
      product =>
        String(
          product.name || ""
        )
          .toLowerCase()
          .includes(query) ||

        String(
          product.category || ""
        )
          .toLowerCase()
          .includes(query)
    );

  renderProducts(
    filtered
  );

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

      closeProductDetails();

      closeCart();

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

  modal.classList.add(
    "active"
  );

  document.body.style.overflow =
    "hidden";

  const input =
    document.getElementById(
      "searchInput"
    );

  if (input) {

    setTimeout(() => {
      input.focus();
    }, 100);

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

  modal.classList.remove(
    "active"
  );

  document.body.style.overflow =
    "";

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
/* ========================================================
   CLOSE CART WHEN CLICKING OUTSIDE
======================================================== */

document.addEventListener("click", function (event) {

  const cartPanel = document.getElementById("cartPanel");

  if (!cartPanel) return;

  // Cart is not open
  if (!cartPanel.classList.contains("active")) return;

  // Click inside cart → keep it open
  if (cartPanel.contains(event.target)) return;

  // Click cart button → keep normal cart-button behavior
  if (event.target.closest(".cart-btn")) return;

  // Click anywhere else → close cart
  closeCart();

});

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
