// =========================================
// CANVO APP
// =========================================


// =========================================
// CART
// =========================================

let cart =
  JSON.parse(
    localStorage.getItem(
      "canvoCart"
    ) || "[]"
  );


// =========================================
// MONEY FORMAT
// =========================================

function money(n) {

  return (
    "৳" +
    Number(n || 0)
      .toLocaleString("en-BD")
  );

}


// =========================================
// RENDER PRODUCTS
// =========================================

function renderProducts() {

  const grid =
    document.getElementById(
      "productGrid"
    );


  if (!grid) {
    return;
  }


  if (!products.length) {

    grid.innerHTML = `

      <div
        style="
          grid-column: 1 / -1;
          text-align: center;
          padding: 50px 20px;
        "
      >

        <p>
          No products available.
        </p>

      </div>

    `;

    return;

  }


  grid.innerHTML =

    products
      .map(
        p => `

          <article class="product-card">

            <div class="product-image">

              ${
                p.badge
                  ? `
                    <span class="badge">
                      ${escapeHtml(p.badge)}
                    </span>
                  `
                  : ""
              }


              <button
                class="wish"
                onclick="wishlist(this)"
                type="button"
              >
                ♡
              </button>


              ${
                p.image

                  ? `
                    <img
                      src="${escapeHtml(p.image)}"
                      alt="${escapeHtml(p.name)}"
                    >
                  `

                  : `
                    <div
                      style="
                        width:100%;
                        height:100%;
                        min-height:250px;
                        background:#f1f3f5;
                      "
                    ></div>
                  `
              }

            </div>


            <div class="product-info">

              <h3>
                ${escapeHtml(p.name)}
              </h3>


              <p>
                ${escapeHtml(p.category)}
              </p>


              <div class="price">

                ${money(p.price)}

                ${
                  p.oldPrice
                    ? `
                      <span class="old-price">
                        ${money(p.oldPrice)}
                      </span>
                    `
                    : ""
                }

              </div>


              <button
                class="add-btn"
                onclick="addToCart(${Number(p.id)})"
                type="button"
              >
                ADD TO CART
              </button>

            </div>

          </article>

        `
      )
      .join("");

}


// =========================================
// ADD TO CART
// =========================================

function addToCart(id) {

  const p =
    products.find(
      x =>
        Number(x.id) ===
        Number(id)
    );


  if (!p) {

    showToast(
      "Product not found"
    );

    return;

  }


  const existing =
    cart.find(
      x =>
        Number(x.id) ===
        Number(id)
    );


  if (existing) {

    existing.qty++;

  } else {

    cart.push({
      ...p,
      qty: 1
    });

  }


  saveCart();


  showToast(
    `${p.name} added to cart`
  );

}


// =========================================
// REMOVE FROM CART
// =========================================

function removeFromCart(id) {

  cart =
    cart.filter(
      x =>
        Number(x.id) !==
        Number(id)
    );


  saveCart();

  renderCart();

}


// =========================================
// SAVE CART
// =========================================

function saveCart() {

  localStorage.setItem(
    "canvoCart",
    JSON.stringify(cart)
  );


  updateCount();

}


// =========================================
// UPDATE CART COUNT
// =========================================

function updateCount() {

  const cartCount =
    document.getElementById(
      "cartCount"
    );


  if (!cartCount) {
    return;
  }


  cartCount.textContent =
    cart.reduce(
      (a, b) =>
        a + Number(b.qty || 0),
      0
    );

}


// =========================================
// RENDER CART
// =========================================

function renderCart() {

  const box =
    document.getElementById(
      "cartItems"
    );


  if (!box) {
    return;
  }


  if (!cart.length) {

    box.innerHTML =
      '<p class="empty">Your cart is empty.</p>';

  } else {

    box.innerHTML =

      cart
        .map(
          x => `

            <div class="cart-line">

              ${
                x.image

                  ? `
                    <img
                      src="${escapeHtml(x.image)}"
                      alt="${escapeHtml(x.name)}"
                    >
                  `

                  : `
                    <div
                      style="
                        width:60px;
                        height:60px;
                        background:#f1f3f5;
                      "
                    ></div>
                  `
              }


              <div>

                <h4>
                  ${escapeHtml(x.name)}
                </h4>


                <p>
                  ${money(x.price)}
                  ×
                  ${Number(x.qty || 0)}
                </p>


                <button
                  class="remove"
                  onclick="removeFromCart(${Number(x.id)})"
                  type="button"
                >
                  Remove
                </button>

              </div>

            </div>

          `
        )
        .join("");

  }


  const total =
    cart.reduce(
      (a, b) =>
        a +
        Number(b.price || 0) *
        Number(b.qty || 0),
      0
    );


  const cartTotal =
    document.getElementById(
      "cartTotal"
    );


  if (cartTotal) {

    cartTotal.textContent =
      money(total);

  }

}


// =========================================
// OPEN CART
// =========================================

function openCart() {

  const panel =
    document.getElementById(
      "cartPanel"
    );


  if (!panel) {
    return;
  }


  panel.classList.add(
    "active"
  );


  renderCart();

}


// =========================================
// CLOSE CART
// =========================================

function closeCart() {

  const panel =
    document.getElementById(
      "cartPanel"
    );


  if (!panel) {
    return;
  }


  panel.classList.remove(
    "active"
  );

}


// =========================================
// OPEN SEARCH
// =========================================

function openSearch() {

  const modal =
    document.getElementById(
      "searchModal"
    );


  if (!modal) {
    return;
  }


  modal.classList.add(
    "active"
  );


  setTimeout(
    () => {

      const input =
        document.getElementById(
          "searchInput"
        );


      if (input) {
        input.focus();
      }

    },
    100
  );

}


// =========================================
// CLOSE SEARCH
// =========================================

function closeSearch() {

  const modal =
    document.getElementById(
      "searchModal"
    );


  if (!modal) {
    return;
  }


  modal.classList.remove(
    "active"
  );

}


// =========================================
// SEARCH PRODUCTS
// =========================================

function searchProducts() {

  const input =
    document.getElementById(
      "searchInput"
    );


  const results =
    document.getElementById(
      "searchResults"
    );


  if (!input || !results) {
    return;
  }


  const q =
    input.value
      .toLowerCase()
      .trim();


  if (!q) {

    results.innerHTML =
      "";

    return;

  }


  const found =
    products.filter(
      p =>
        (
          p.name +
          " " +
          p.category
        )
          .toLowerCase()
          .includes(q)
    );


  results.innerHTML =

    found.length

      ? found
          .map(
            p => `

              <p
                style="
                  padding:12px 0;
                  border-bottom:1px solid #333;
                "
              >

                ${escapeHtml(p.name)}
                —
                ${money(p.price)}

              </p>

            `
          )
          .join("")

      : "<p>No products found.</p>";

}


// =========================================
// MOBILE MENU
// =========================================

function toggleMenu() {

  const nav =
    document.getElementById(
      "nav"
    );


  if (!nav) {
    return;
  }


  nav.classList.toggle(
    "active"
  );

}


// =========================================
// WISHLIST
// =========================================

function wishlist(btn) {

  btn.textContent =
    btn.textContent === "♡"
      ? "♥"
      : "♡";


  showToast(
    "Wishlist updated"
  );

}


// =========================================
// NEWSLETTER
// =========================================

function subscribe(e) {

  e.preventDefault();


  showToast(
    "Thank you for subscribing to CANVO"
  );


  e.target.reset();

}


// =========================================
// CHECKOUT
// =========================================

function checkout() {

  if (!cart.length) {

    showToast(
      "Your cart is empty"
    );

    return;

  }


  showToast(
    "Checkout page will be added next"
  );

}


// =========================================
// TOAST
// =========================================

function showToast(msg) {

  const t =
    document.getElementById(
      "toast"
    );


  if (!t) {
    return;
  }


  t.textContent =
    msg;


  t.classList.add(
    "show"
  );


  setTimeout(
    () =>
      t.classList.remove(
        "show"
      ),
    2200
  );

}


// =========================================
// HTML ESCAPE
// =========================================

function escapeHtml(value) {

  return String(
    value ?? ""
  )

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );

}


// =========================================
// INITIALIZE WEBSITE
// =========================================

async function initializeStore() {

  /*
   * First load products from
   * Cloudflare D1.
   */

  await loadProducts();


  /*
   * Then render the products.
   */

  renderProducts();


  /*
   * Restore cart count.
   */

  updateCount();

}


// =========================================
// START
// =========================================

initializeStore();
