import{s as e}from"./speed-insights-NwVgDXFx.js";/* empty css             */import{a as t,o as n,s as r,t as i}from"./cart-utils-Cg7pFG_6.js";import"./product-modal-Dvx9hCCP.js";function a(){document.querySelectorAll(`.product-card__add`).forEach(e=>{e.addEventListener(`click`,a=>{a.stopPropagation();let o=e.closest(`.product-card`);if(!o)return;let s=o.id,c=o.querySelector(`.product-card__name`)?.textContent||`Producto`,l=o.querySelector(`.product-card__shop`)?.textContent?.replace(` Tienda`,``)||``,u=o.querySelector(`.product-card__price`)?.textContent||`$0`,d=parseFloat(u.replace(/[^0-9]/g,``))||0,f=o.querySelector(`.product-card__image img`)?.getAttribute(`src`)||``,p=i(),m=p.find(e=>e.id===s);m?m.qty++:p.push({id:s,name:c,shop:l,price:d,priceOld:null,image:f,qty:1}),t(p),e.style.transform=`scale(0.95)`,setTimeout(()=>{e.style.transform=``},100),r(),n(`${c} agregado al carrito`,`success`)})})}function o(){document.querySelectorAll(`.product-card__wishlist`).forEach(e=>{e.addEventListener(`click`,t=>{t.preventDefault(),t.stopPropagation();let r=e.querySelector(`i`);r.classList.contains(`fa-regular`)?(r.classList.remove(`fa-regular`),r.classList.add(`fa-solid`),r.style.color=`#ef4444`,n(`Agregado a favoritos`,`success`)):(r.classList.remove(`fa-solid`),r.classList.add(`fa-regular`),r.style.color=``,n(`Eliminado de favoritos`))})})}document.addEventListener(`DOMContentLoaded`,async()=>{r();let t=document.getElementById(`search-input`);t&&t.addEventListener(`keydown`,e=>{if(e.key===`Enter`){e.preventDefault();let n=t.value.trim();n&&(window.location.href=`./search.html?q=${encodeURIComponent(n)}`)}});let n=document.getElementById(`main-content`),i=new URLSearchParams(window.location.search).get(`id`);if(!i){n.innerHTML=`<div style="text-align: center; padding: 4rem; color: #ef4444;">No se especificó un comercio.</div>`;return}try{let{data:t,error:r}=await e.from(`stores`).select(`*`).eq(`id`,i).single();if(r||!t)throw r||Error(`Comercio no encontrado`);document.title=`${t.name} — Baradero Local`;let{data:s,error:c}=await e.from(`products`).select(`*`).eq(`store_id`,i).eq(`is_active`,!0).order(`created_at`,{ascending:!1});if(c)throw c;let l=``;l=!s||s.length===0?`<div style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 2rem;">Este comercio aún no tiene productos publicados.</div>`:s.map(e=>{let n=e.price.toLocaleString(`es-AR`);return`
          <article class="product-card" id="${e.id}">
            <div class="product-card__image">
              <img src="${e.image_url||`../Assets/images/default-product.png`}" alt="${e.title}" loading="lazy" />
              <button class="product-card__wishlist" aria-label="Agregar a favoritos"><i class="fa-regular fa-heart"></i></button>
            </div>
            <div class="product-card__body">
              <span class="product-card__shop"><i class="fa-solid fa-store"></i> ${t.name}</span>
              <h3 class="product-card__name">${e.title}</h3>
              <div class="product-card__price-row">
                <span class="product-card__price">$${n}</span>
              </div>
              <button class="product-card__add" data-product-id="${e.id}"><i class="fa-solid fa-cart-plus"></i> Agregar</button>
            </div>
          </article>
        `}).join(``),n.innerHTML=`
      <header class="store-header">
        <h1 class="store-header__title">${t.name}</h1>
        <p class="store-header__description">${t.description||`Sin descripción disponible.`}</p>
        <div class="store-header__meta">
          <span><i class="fa-solid fa-location-dot"></i> Baradero</span>
          <span><i class="fa-solid fa-box"></i> ${s?.length||0} productos</span>
        </div>
      </header>
      
      <section class="store-products">
        <div class="products__grid" id="store-products-grid">
          ${l}
        </div>
      </section>
    `,a(),o(),typeof initProductModal==`function`&&initProductModal()}catch(e){console.error(`Error fetching store:`,e),n.innerHTML=`<div style="text-align: center; padding: 4rem; color: #ef4444;">No se pudo cargar la información del comercio.</div>`}});