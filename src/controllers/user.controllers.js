import { asyncHandler } from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User } from "../models/user.models.js"
import { uploadOnCloudinary , deleteFromCloudinary} from "../utils/cloudinary.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"


const generateAccessAndRefereshToken=async(userId)=>{


 try {
    const user = await User.findById(userId)
    //small check for user existence
      const accessToken=user.generateAccessToken()
      const refreshToken=user.generateRefreshToken()
   
      user.refreshToken=refreshToken
      await user.save({validateBeforeSave: false})
      return {accessToken, refreshToken}
   
 } catch (error) {
    throw new ApiError(500,"Something went wrong while generating access and refresh tokens")
    
 }
}

const registerUser=asyncHandler(async (req, res)=>{
    //todo
 const {fullName,email,username,password}= req.body
 //validation
 if(
    [fullName,username,email,password].some((field)=>field?.trim()==="")
 ){
    throw new ApiError(400,"all fields are required")
 }
const existedUser=await User.findOne({
    $or:[{username},{email}]
})
   if(existedUser){
    throw new ApiError(409,"user with email or username already exists")
   }
   console.warn(req.files)
  const avatarLocalPath= req.files?.avatar?.[0]?.path
  const coverLocalPath= req.files?.coverImage?.[0]?.path
  if(!avatarLocalPath){
    throw new ApiError(400,"avatar file is missing")
  }

//   const avatar = await uploadOnCloudinary(avatarLocalPath)
//    let coverImage=""
//   if (coverLocalPath) {
//   coverImage = await uploadOnCloudinary(coverImage)     
//   }
let avatar;
try {
   avatar= await uploadOnCloudinary(avatarLocalPath)
   console.log("uploaded avatar",avatar)
} catch (error) {
    console.log("error uploading avatar",error)
    throw new ApiError(500,"failed to upload avatar")
    
}
let coverImage;
try {
    coverImage= await uploadOnCloudinary(coverLocalPath)
    console.log("uploaded coverimage",coverImage)
 } catch (error) {
     console.log("error uploading coverimage",error)
     throw new ApiError(500,"failed to upload coverimage")
     
 }

  
// try {
//     const user = await User.create({
//         fullName,
//         avatar: avatar.url,
//         coverImage: coverImage?.url || "",
//         email, 
//         password,
//         username: username.toLowerCase(),
//     })

//     const createdUser = await User.findById(user._id).select(
//         "-password -refreshToken"
//     )

//     if (!createdUser) {
//         throw new ApiError(500, "Something went wrong while registering the user")
//     }

//     return res.status(201).json(
//         new ApiResponse(200, createdUser, "User registered Successfully")
//     )
// } catch (error) {
//     console.log("user creation failed ")
//     if(avatar){
//         await deleteFromCloudinary(avatar.public_id)
//     }
//     if(coverImage){
//         await deleteFromCloudinary(coverImage.public_id)
//     }
//     throw new ApiError(500, "something went wrong while registering a user and image were deleted")
try {
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase(),
    });

    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    if (!createdUser) {
        throw new ApiError(500, "Failed to retrieve created user from database");
    }

    return res.status(201).json(new ApiResponse(200, createdUser, "User registered Successfully"));
} catch (error) {
    console.log("Error during user creation:", error.message);
    console.log(error.stack);

    if (avatar) {
        console.log("Deleting avatar from Cloudinary...");
        await deleteFromCloudinary(avatar.public_id);
    }
    if (coverImage) {
        console.log("Deleting cover image from Cloudinary...");
        await deleteFromCloudinary(coverImage.public_id);
    }

    throw new ApiError(500, "Error registering user. Uploaded images were deleted.");


}

})

const loginUser=asyncHandler(async(req,res)=>{
//get data from body
   const {email,username,password}=req.body

   //validation
   if(!email){
    throw new ApiError(400,"email is required")
   }
   const user=await User.findOne({
    $or:[{username},{email}]
})
    if(!user){
        throw new ApiError(404,"user not found")
    }

     //validate password 
     const isPasswordValid=await user.isPasswordCorrect(password)

     if (!isPasswordValid){
        throw new ApiError(401,"invalid credentials")
     }
     const {accessToken,refreshToken}=await
     generateAccessAndRefereshToken(user._id)

     const loggedInUser=await User.findById(user._id)
     .select("-password -refreshToken")

     const options={
        httpOnly:true,
        secure:process.env.NODE_ENV==="production",
     }

     return res
     .status(200)
     .cookie("accessToken", accessToken,options)
     .cookie("refreshToken", refreshToken,options)
     .json(new ApiResponse(
        200,
        {user: loggedInUser,accessToken,refreshToken},
        "user logged in successfully"
    ))


})

const logoutUser = asyncHandler(async (req,res)=>{
    await User.findByIdAndUpdate(
        //need to come back here after midddleware video
        req.user._id,
        {
            $set:{
                refreshToken:undefined,           
             }

        },
        {new:true}
    )
    const options={
        httpOnly:true,
        secure:process.env.NODE_ENV==="production",
    }
    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(new ApiResponse(200,"user logged out successfully"))
})

const refreshAccessToken=asyncHandler(async(req,res)=>{
     const incomingRefreshToken= req.cookies.refreshToken || req.body.refreshToken

     if(!incomingRefreshToken){
        throw new ApiError(401,"refresh token is required")
     }
     try {
     const decodedToken=jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
       const user= await User.findById(decodedToken?._id)

       if(!user){
        throw new ApiError(401,"invalid refresh token ")
       }
       if(incomingRefreshToken!==user?.refreshToken){
        throw new ApiError(401,"invalid")
       }
const options={
    httpOnly:true,
    secure:process.env.NODE_ENV==="production",
}
  const {accessToken,newRefreshToken}=await generateAccessAndRefereshToken(user._id)
          
  return res
  .status(200)
  .cookie("accessToken", accessToken,options)
  .cookie("refreshToken", newRefreshToken,options)
  .json(
    new ApiResponse(200,{accessToken,refreshToken: newRefreshToken},"access token refreshed successfully")
  )
        
     } catch (error) {
        throw new ApiError(500, "something went wrong while refreshing accesss token")
     }


})


 
export{
    registerUser,
    loginUser,
    refreshAccessToken,
    logoutUser,
    
}