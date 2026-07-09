import{s as e}from"./speed-insights-NwVgDXFx.js";/* empty css             *//* empty css                */import"./product-modal-Blo12BES.js";import{c as t,i as n,r,t as i}from"./cart-utils-BB-_Xszd.js";document.addEventListener(`DOMContentLoaded`,async()=>{t();let a=document.getElementById(`search-input`);a&&a.addEventListener(`keydown`,e=>{if(e.key===`Enter`){e.preventDefault();let t=a.value.trim();t&&(window.location.href=`./search.html?q=${encodeURIComponent(t)}`)}});let o=document.getElementById(`main-content`),s=new URLSearchParams(window.location.search).get(`id`);if(!s){o.innerHTML=`<div style="text-align: center; padding: 4rem; color: #ef4444;">No se especificó un comercio.</div>`;return}try{let{data:t,error:a}=await e.from(`stores`).select(`*`).eq(`id`,s).single();if(a||!t)throw a||Error(`Comercio no encontrado`);document.title=`${t.name} — Baradero Local`;let{data:c,error:l}=await e.from(`products`).select(`*`).eq(`store_id`,s).eq(`is_active`,!0).order(`created_at`,{ascending:!1});if(l)throw l;let u=``;u=!c||c.length===0?`<div style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 2rem;">Este comercio aún no tiene productos publicados.</div>`:c.map(e=>`
          <article class="product-card" id="${e.id}" data-price="${e.price}">
            <div class="product-card__image">
              <img src="${e.image_url||`../Assets/images/default-product.png`}" alt="${e.title}" loading="lazy" />
              <button class="product-card__wishlist" aria-label="Agregar a favoritos"><i class="fa-regular fa-heart"></i></button>
            </div>
            <div class="product-card__body">
              <span class="product-card__shop"><i class="fa-solid fa-store"></i> ${t.name}</span>
              <h3 class="product-card__name">${e.title}</h3>
              <div class="product-card__price-row">
                <span class="product-card__price">${i(e.price)}</span>
              </div>
              <button class="product-card__add" data-product-id="${e.id}"><i class="fa-solid fa-cart-plus"></i> Agregar</button>
            </div>
          </article>
        `).join(``),o.innerHTML=`
      <header class="store-header">
        <h1 class="store-header__title">${t.name}</h1>
        <p class="store-header__description">${t.description||`Sin descripción disponible.`}</p>
        <div class="store-header__meta">
          <span><i class="fa-solid fa-location-dot"></i> Baradero</span>
          <span><i class="fa-solid fa-box"></i> ${c?.length||0} productos</span>
        </div>
      </header>
      
      <section class="store-products">
        <div class="products__grid" id="store-products-grid">
          ${u}
        </div>
      </section>
    `,r(),n(),typeof initProductModal==`function`&&initProductModal()}catch(e){console.error(`Error fetching store:`,e),o.innerHTML=`<div style="text-align: center; padding: 4rem; color: #ef4444;">No se pudo cargar la información del comercio.</div>`}});