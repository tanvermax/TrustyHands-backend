const express = require('express');
const cors = require('cors');

const app = express();
const  port = process.env.PORT || 5000;
// service_job
// ZSJxoR0PyYs4JDmS

app.use(cors());
app.use(express.json());


app.get('/', (req,res)=>{
    res.send('service is getting ready ')
})



app.listen( port, ()=>{
    console.log("service portal is runnning on ", port);
    
})