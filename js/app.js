let cart = JSON.parse(localStorage.getItem("canvoCart") || "[]");

function money(n){return "৳" + n.toLocaleString("en-BD");}

function renderProducts(){
  const grid=document.getElementById("productGrid");
  if(!grid)return;
  grid.innerHTML=products.map(p=>`
    <article class="product-card">
      <div class="product-image">
        ${p.badge ? `<span class="badge">${p.badge}</span>` : ""}
        <button class="wish" onclick="wishlist(this)">♡</button>
        <img src="${p.image}" alt="${p.name}">
      </div>
      <div class="product-info">
        <h3>${p.name}</h3>
        <p>${p.category}</p>
        <div class="price">${money(p.price)} ${p.oldPrice ? `<span class="old-price">${money(p.oldPrice)}</span>` : ""}</div>
        <button class="add-btn" onclick="addToCart(${p.id})">ADD TO CART</button>
      </div>
    </article>
  `).join("");
}

function addToCart(id){
  const p=products.find(x=>x.id===id);
  const existing=cart.find(x=>x.id===id);
  if(existing) existing.qty++;
  else cart.push({...p,qty:1});
  saveCart();
  showToast(`${p.name} added to cart`);
}

function removeFromCart(id){
  cart=cart.filter(x=>x.id!==id);
  saveCart();
  renderCart();
}

function saveCart(){
  localStorage.setItem("canvoCart",JSON.stringify(cart));
  updateCount();
}

function updateCount(){
  document.getElementById("cartCount").textContent=cart.reduce((a,b)=>a+b.qty,0);
}

function renderCart(){
  const box=document.getElementById("cartItems");
  if(!cart.length){
    box.innerHTML='<p class="empty">Your cart is empty.</p>';
  }else{
    box.innerHTML=cart.map(x=>`
      <div class="cart-line">
        <img src="${x.image}" alt="${x.name}">
        <div>
          <h4>${x.name}</h4>
          <p>${money(x.price)} × ${x.qty}</p>
          <button class="remove" onclick="removeFromCart(${x.id})">Remove</button>
        </div>
      </div>
    `).join("");
  }
  document.getElementById("cartTotal").textContent=money(cart.reduce((a,b)=>a+b.price*b.qty,0));
}

function openCart(){
  document.getElementById("cartPanel").classList.add("active");
  renderCart();
}
function closeCart(){document.getElementById("cartPanel").classList.remove("active")}

function openSearch(){
  document.getElementById("searchModal").classList.add("active");
  setTimeout(()=>document.getElementById("searchInput").focus(),100);
}
function closeSearch(){document.getElementById("searchModal").classList.remove("active")}

function searchProducts(){
  const q=document.getElementById("searchInput").value.toLowerCase().trim();
  const r=document.getElementById("searchResults");
  if(!q){r.innerHTML="";return}
  const found=products.filter(p=>(p.name+" "+p.category).toLowerCase().includes(q));
  r.innerHTML=found.length ? found.map(p=>`<p style="padding:12px 0;border-bottom:1px solid #333">${p.name} — ${money(p.price)}</p>`).join("") : "<p>No products found.</p>";
}

function toggleMenu(){document.getElementById("nav").classList.toggle("active")}
function wishlist(btn){btn.textContent=btn.textContent==="♡"?"♥":"♡";showToast("Wishlist updated")}
function subscribe(e){e.preventDefault();showToast("Thank you for subscribing to CANVO");e.target.reset()}
function checkout(){
  if(!cart.length){showToast("Your cart is empty");return}
  showToast("Checkout page will be added next");
}
function showToast(msg){
  const t=document.getElementById("toast");
  t.textContent=msg;t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),2200);
}
renderProducts();
updateCount();
