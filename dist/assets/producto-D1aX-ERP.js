import{s as e}from"./speed-insights-NwVgDXFx.js";/* empty css             *//* empty css                */import{c as t,n,o as r,s as i,t as a}from"./cart-utils-BB-_Xszd.js";document.addEventListener(`DOMContentLoaded`,async()=>{t();let o=document.getElementById(`search-input`);o&&o.addEventListener(`keydown`,e=>{if(e.key===`Enter`){e.preventDefault();let t=o.value.trim();t&&(window.location.href=`./search.html?q=${encodeURIComponent(t)}`)}});let s=document.getElementById(`product-container`),c=new URLSearchParams(window.location.search).get(`id`);if(!c){s.innerHTML=`<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: #ef4444;">No se especificó un producto.</div>`;return}try{let{data:o,error:l}=await e.from(`products`).select(`*, stores(name, id)`).eq(`id`,c).single();if(l||!o)throw l||Error(`Producto no encontrado`);document.title=`${o.title} — Baradero Local`;let u=o.stores?o.stores.name:`Tienda`,d=o.stores?o.stores.id:``,f=o.image_url||`../Assets/images/default-product.png`;s.innerHTML=`
      <div class="product-gallery">
        <img src="${f}" alt="${o.title}" />
      </div>
      <div class="product-info">
        <div class="product-shop">
          <i class="fa-solid fa-store"></i> <a href="./comercio.html?id=${d}" style="color: inherit; text-decoration: none;">${u}</a>
        </div>
        <h1 class="product-title">${o.title}</h1>
        <div class="product-price">${a(o.price)}</div>
        <div class="product-description">${o.description||`Sin descripción disponible.`}</div>
        
        <div class="product-actions">
          <button class="btn-add-cart" id="btn-add-cart">
            <i class="fa-solid fa-cart-plus"></i> Agregar al carrito
          </button>
        </div>
      </div>
    `;let p=document.getElementById(`btn-add-cart`);p.addEventListener(`click`,()=>{let e=n(),a=e.find(e=>e.id===o.id);a?a.qty++:e.push({id:o.id,name:o.title,shop:u,price:o.price,priceOld:null,image:f,qty:1}),r(e),p.style.transform=`scale(0.95)`,setTimeout(()=>{p.style.transform=``},100),t(),i(`${o.title} agregado al carrito`,`success`)})}catch(e){console.error(`Error fetching product:`,e),s.innerHTML=`<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: #ef4444;">No se pudo cargar el producto.</div>`}});