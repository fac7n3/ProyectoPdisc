import{s as e}from"./auth-utils-CEC6VUul.js";/* empty css             */import{a as t,o as n,s as r,t as i}from"./cart-utils-Cg7pFG_6.js";document.addEventListener(`DOMContentLoaded`,async()=>{r();let a=document.getElementById(`search-input`);a&&a.addEventListener(`keydown`,e=>{if(e.key===`Enter`){e.preventDefault();let t=a.value.trim();t&&(window.location.href=`./search.html?q=${encodeURIComponent(t)}`)}});let o=document.getElementById(`product-container`),s=new URLSearchParams(window.location.search).get(`id`);if(!s){o.innerHTML=`<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: #ef4444;">No se especificó un producto.</div>`;return}try{let{data:a,error:c}=await e.from(`products`).select(`*, stores(name, id)`).eq(`id`,s).single();if(c||!a)throw c||Error(`Producto no encontrado`);document.title=`${a.title} — Baradero Local`;let l=(a.price_cents/100).toLocaleString(`es-AR`),u=a.stores?a.stores.name:`Tienda`,d=a.stores?a.stores.id:``,f=a.image_url||`../Assets/images/default-product.png`;o.innerHTML=`
      <div class="product-gallery">
        <img src="${f}" alt="${a.title}" />
      </div>
      <div class="product-info">
        <div class="product-shop">
          <i class="fa-solid fa-store"></i> <a href="./comercio.html?id=${d}" style="color: inherit; text-decoration: none;">${u}</a>
        </div>
        <h1 class="product-title">${a.title}</h1>
        <div class="product-price">$${l}</div>
        <div class="product-description">${a.description||`Sin descripción disponible.`}</div>
        
        <div class="product-actions">
          <button class="btn-add-cart" id="btn-add-cart">
            <i class="fa-solid fa-cart-plus"></i> Agregar al carrito
          </button>
        </div>
      </div>
    `;let p=document.getElementById(`btn-add-cart`);p.addEventListener(`click`,()=>{let e=i(),o=e.find(e=>e.id===a.id);o?o.qty++:e.push({id:a.id,name:a.title,shop:u,price:a.price_cents/100,priceOld:null,image:f,qty:1}),t(e),p.style.transform=`scale(0.95)`,setTimeout(()=>{p.style.transform=``},100),r(),n(`${a.title} agregado al carrito`,`success`)})}catch(e){console.error(`Error fetching product:`,e),o.innerHTML=`<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: #ef4444;">No se pudo cargar el producto.</div>`}});