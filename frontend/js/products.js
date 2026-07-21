const API =
"https://smartmarket-a133.onrender.com/api/products";


let editID=null;



async function loadProducts(){


const res =
await fetch(API);


const json =
await res.json();



let html="";



json.data.forEach(p=>{


html+=`

<tr>

<td>${p.id}</td>


<td>${p.name}</td>


<td>
${Number(p.price).toLocaleString()} đ
</td>


<td>
${p.business_name || ""}
</td>


<td>
${p.stall_code || ""}
</td>


<td>


<button onclick="editProduct(${p.id})">
Sửa
</button>


<button onclick="deleteProduct(${p.id})">
Xóa
</button>


</td>


</tr>


`;

});



document.getElementById(
"productList"
).innerHTML=html;


}





function openForm(){

document.getElementById(
"formBox"
).style.display="block";

}



function closeForm(){

document.getElementById(
"formBox"
).style.display="none";

editID=null;

}





async function saveProduct(){


const data={


name:
document.getElementById("name").value,


price:
document.getElementById("price").value,


trader_id:
document.getElementById("trader_id").value,


stall_id:
document.getElementById("stall_id").value

};





let url=API;

let method="POST";



if(editID){


url += "/" + editID;

method="PUT";


}



await fetch(url,{


method,


headers:{

"Content-Type":"application/json"

},


body:
JSON.stringify(data)


});



closeForm();

loadProducts();


}







async function deleteProduct(id){


if(!confirm(
"Xóa sản phẩm?"
)) return;



await fetch(
API+"/"+id,
{
method:"DELETE"
}
);



loadProducts();


}








async function editProduct(id){


const res =
await fetch(
API+"/"+id
);


const json =
await res.json();



const p=json.data;



document.getElementById("name").value=p.name;

document.getElementById("price").value=p.price;

document.getElementById("trader_id").value=p.trader_id;

document.getElementById("stall_id").value=p.stall_id;



editID=id;



openForm();


}






document
.getElementById("search")
.addEventListener(
"keyup",
function(){


let value=this.value.toLowerCase();


document
.querySelectorAll("#productList tr")
.forEach(row=>{


row.style.display =
row.innerText
.toLowerCase()
.includes(value)
? ""
:"none";


});


});





loadProducts();