import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";


const healthcheck=asyncHandler(async(req,res)=>{
    console.log("error")
    return res.status(200).json(new ApiResponse(200,"OK","Health check passseed"))
})

export {healthcheck}