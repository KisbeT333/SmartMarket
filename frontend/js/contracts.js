const API =
"http://localhost:3000/api/contracts";


let editID=null;



async function loadContracts(){


const res =
await fetch(API);


const json =
await res.json();



let html="";



json.data.forEach(c=>{


html+=`

<tr>


<td>${c.id}</td>


<td>
${c.business_name || ""}
</td>



<td>
${c.stall_code || ""}
</td>



<td>
${c.market_name || ""}
</td>




<td>
${c.start_date}
</td>



<td>
${c.end_date}
</td>



<td>
${Number(c.monthly_rent)
.toLocaleString()} đ
</td>



<td>
${c.status}
</td>



<td>


<button onclick="editContract(${c.id})">
Sửa
</button>



<button onclick="deleteContract(${c.id})">
Xóa
</button>



</td>



</tr>

`;

});



document
.getElementById("contractList")
.innerHTML=html;


}







function openForm(){

document
.getElementById("formBox")
.style.display="block";

}




function closeForm(){

document
.getElementById("formBox")
.style.display="none";


editID=null;

}








async function saveContract(){


const data={


trader_id:
trader_id.value,


stall_id:
stall_id.value,


start_date:
start_date.value,


end_date:
end_date.value,


monthly_rent:
monthly_rent.value,


status:
status.value


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


"Content-Type":
"application/json"


},


body:
JSON.stringify(data)



});



closeForm();

loadContracts();



}










async function deleteContract(id){


if(!confirm(
"Xóa hợp đồng?"
))
return;



await fetch(
API+"/"+id,
{
method:"DELETE"
}
);



loadContracts();

}









async function editContract(id){



const res =
await fetch(
API+"/"+id
);



const json =
await res.json();



const c=json.data;



trader_id.value =
c.trader_id;


stall_id.value =
c.stall_id;


start_date.value =
c.start_date;


end_date.value =
c.end_date;


monthly_rent.value =
c.monthly_rent;


status.value =
c.status;



editID=id;



openForm();


}







loadContracts();