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

const changeCurrentPassword= asyncHandler(async(req,res)=>{
       const {oldPassword,newPassword}=req.body
       const user=await User.findById(req.user?._id)
    const isPasswordValid=await user.isPasswordCorrect(oldPassword)

    if(!isPasswordValid){
        throw new ApiError(401,"old password is incorrect")
        
    }
    user.password=newPassword;
    await user.save({validateBeforeSave:false})
    return res.status(200).json(new ApiResponse(200,{},"password changed successsfully"))
})

const getCurrentUser=asyncHandler(async(req,res)=>{
    return res.status(200).json(new ApiResponse(200,req.user,"current user details"))
})

const updateAccountDetails=asyncHandler(async(req,res)=>{
    const {fullname,email}=req.body

    if(!fullname|| !email){
        throw new ApiError(400,"fullname and email are required")
     }
     
    const user= await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullname,
                email:email,
            }

        },
        {new:true}
     ).select("-password")
      return res.status(200).json(new ApiResponse(200,user,"Account details updated successfully"))
})

const updateUserAvatar=asyncHandler(async(req,res)=>{
    const avatarLocalPath=req.files?.path
    if(!avatarLocalPath){
        throw new ApiError(400,"file is required")
    }
    const avatar= await uploadOnCloudinary(avatarLocalPath) 
    if(!avatar.url){
        throw new ApiError(500,"something went wrong while uploading avatar")

     }
    const user= await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar:avatar.url
            }
        },
        {new:true}
     ).select("-password -refreshToken")
      
     res.status(200).json(new ApiResponse(200,user,"Avatar update succeessfully"))


    })

    const updateUserCoverImage=asyncHandler(async (req,res)=>{
        const coverImageLocalPath=req.file?.path
        if(!coverImageLocalPath){
            throw new ApiError(400,"file is required")
        }
        const coverImage=await uploadOnCloudinary(coverImageLocalPath)
        if(!coverImage.url){
            throw new ApiError(500,"something went wrong while uploading cover image")
        }
        const user=await User.findByIdAndUpdate(
            req.user?._id,
            {
                $set:{
                    coverImage:coverImage.url
                }
            },
            {new:true}
        ).select("-password -refreshToken")

        return res.status(200).json(new ApiResponse(200,user,"cover image updated successfully"))

    })
const getUserChannelProfile=asyncHandler(async(req,res)=>{
     const {username}=req.params
     if(!username?.trim()){
        throw new ApiError(400,"username is required");
     }
     const channel=await User.aggregate([
        {
            $match:{
                username:username?.toLowerCase()
            }
        },{
            $lookup:{
                from:"subscription",
                localField:"_id",
                foreignField:"channel",
                as:"susbcribers"
            }
        },{
            $lookup:{
                from:"subscription",
                localField:"_id",
                foreignField:"subscriber",
                as:"subscriberedTo"
            }
        },
        {
              $addFields:{
              subscribersCount:{
                $size:"$susbcribers"
              },
                channelSubscribedToCount:{
                    $size:"$subscriberedTo"
                },
                isSubScribed:{
                    $cond:{
                        if:{
                            $in:[req.user?._id,"$susbcribers.subscriber"]
                        },
                        then: true,
                        else: false
                    }
                }

                
            
              }
              
        },
        {
            //project only the neccessary data
            $project:{
                fullname:1,
                username:1,
                avatar:1,
                subscribersCount:1,
                channelsSubscribedToCount:1,
                isSubScribed:1,
                coverImage:1,
                email:1
            }
        }

     ])

     if(!channel?.length){
        throw new ApiError(404,"channel not found");        
     }

     return res.status(200).json(new ApiResponse(200,
        channel[0], "channel profile fetched successfully"
     ))

})


const getWatchHistory= asyncHandler(async(req,res)=>{
    const user = await User.aggregate([
        {
            $match:{
                _id:new mongoose.Types.ObjectId(req.user?._id)

            }
        },
        {
            $lookup:{
                from:"videos",
                localField:"watchHistory",
                foreignField:"_id",
                as: "watchhistory",
                pipeline:[
                    {
                        $lookup:{
                            from:"users",
                            localField:"owner",
                            foreignField:"_id",
                            as:"owner",
                            pipline:[{
                                $project:{
                                    fullname:1,
                                    username:1,
                                    avatar:1
                                }
                            }]
                        }
                    },{
                        $addFields:{
                            owner:{
                                $first:"$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res.status(200).json(new ApiResponse(200,user[0]?.watchHistory,"watch history fetched successfully"))
})


 
export{
    registerUser,
    loginUser,
    refreshAccessToken,
    logoutUser,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
    
}