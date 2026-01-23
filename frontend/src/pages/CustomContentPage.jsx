/** @format */

import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
	Upload,
	Film,
	Tv,
	Image,
	X,
	Play,
	Trash2,
	Eye,
	Clock,
	Plus,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../components/ui/dialog";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const CustomContentPage = () => {
	const navigate = useNavigate();
	const { user, getAuthHeaders } = useAuth();
	const [content, setContent] = useState([]);
	const [loading, setLoading] = useState(true);
	const [uploading, setUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

	// Upload form state
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [mediaType, setMediaType] = useState("movie");
	const [genre, setGenre] = useState("");
	const [year, setYear] = useState("");
	const [videoFile, setVideoFile] = useState(null);
	const [posterFile, setPosterFile] = useState(null);
	const [videoPreview, setVideoPreview] = useState(null);
	const [posterPreview, setPosterPreview] = useState(null);

	const videoInputRef = useRef(null);
	const posterInputRef = useRef(null);

	useEffect(() => {
		fetchContent();
	}, []);

	const fetchContent = async () => {
		setLoading(true);
		try {
			const res = await axios.get(`${API}/custom-content`);
			setContent(res.data.results || []);
		} catch (error) {
			console.error("Failed to fetch content:", error);
		} finally {
			setLoading(false);
		}
	};

	const handleVideoSelect = (e) => {
		const file = e.target.files[0];
		if (file) {
			if (file.size > 500 * 1024 * 1024) {
				// 500MB limit
				toast.error("Video file too large. Maximum size is 500MB");
				return;
			}
			setVideoFile(file);
			setVideoPreview(URL.createObjectURL(file));
		}
	};

	const handlePosterSelect = (e) => {
		const file = e.target.files[0];
		if (file) {
			setPosterFile(file);
			setPosterPreview(URL.createObjectURL(file));
		}
	};

	const resetForm = () => {
		setTitle("");
		setDescription("");
		setMediaType("movie");
		setGenre("");
		setYear("");
		setVideoFile(null);
		setPosterFile(null);
		setVideoPreview(null);
		setPosterPreview(null);
		setUploadProgress(0);
	};

	const handleUpload = async () => {
		if (!title.trim()) {
			toast.error("Please enter a title");
			return;
		}
		if (!videoFile) {
			toast.error("Please select a video file");
			return;
		}

		setUploading(true);
		setUploadProgress(0);

		const formData = new FormData();
		formData.append("title", title);
		formData.append("description", description);
		formData.append("media_type", mediaType);
		formData.append("genre", genre);
		formData.append("year", year || new Date().getFullYear());
		formData.append("video", videoFile);
		if (posterFile) {
			formData.append("poster", posterFile);
		}

		try {
			const res = await axios.post(`${API}/custom-content/upload`, formData, {
				headers: {
					...getAuthHeaders(),
					"Content-Type": "multipart/form-data",
				},
				withCredentials: true,
				onUploadProgress: (progressEvent) => {
					const percent = Math.round(
						(progressEvent.loaded * 100) / progressEvent.total
					);
					setUploadProgress(percent);
				},
			});

			toast.success("Content uploaded successfully!");
			setUploadDialogOpen(false);
			resetForm();
			fetchContent();
		} catch (error) {
			console.error("Upload failed:", error);
			toast.error(error.response?.data?.detail || "Upload failed");
		} finally {
			setUploading(false);
		}
	};

	const deleteContent = async (contentId) => {
		if (!confirm("Are you sure you want to delete this content?")) return;

		try {
			await axios.delete(`${API}/custom-content/${contentId}`, {
				headers: getAuthHeaders(),
				withCredentials: true,
			});
			toast.success("Content deleted");
			fetchContent();
		} catch (error) {
			toast.error(error.response?.data?.detail || "Failed to delete");
		}
	};

	const watchContent = (item) => {
		navigate(
			`/watch/custom/${
				item.content_id
			}?custom=true&videoUrl=${encodeURIComponent(
				BACKEND_URL + item.video_url
			)}`
		);
	};

	if (!user) {
		return (
			<div className="min-h-screen bg-[#050505] flex items-center justify-center">
				<div className="text-center">
					<p className="text-[#A1A1AA] mb-4">Please login to upload content</p>
					<Button onClick={() => navigate("/login")} className="btn-primary">
						Login
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div
			className="min-h-screen bg-[#050505] pb-20 md:pb-8"
			data-testid="custom-content-page">
			<div className="max-w-7xl mx-auto px-6 md:px-12 pt-8">
				{/* Header */}
				<div className="flex items-center justify-between mb-8">
					<div>
						<h1 className="text-3xl md:text-4xl font-bold">My Uploads</h1>
						<p className="text-[#A1A1AA] mt-2">
							Upload and manage your own movies and shows
						</p>
					</div>

					<Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
						<DialogTrigger asChild>
							<Button
								data-testid="upload-btn"
								className="btn-primary flex items-center gap-2">
								<Upload className="w-5 h-5" />
								Upload Content
							</Button>
						</DialogTrigger>
						<DialogContent className="bg-[#0A0A0A] border-white/10 max-w-2xl max-h-[90vh] overflow-y-auto">
							<DialogHeader>
								<DialogTitle>Upload New Content</DialogTitle>
							</DialogHeader>
							<div className="space-y-6 mt-4">
								{/* Title */}
								<div>
									<label className="text-sm text-[#A1A1AA] block mb-2">
										Title *
									</label>
									<Input
										value={title}
										onChange={(e) => setTitle(e.target.value)}
										placeholder="Enter title..."
										data-testid="upload-title"
										className="bg-black/50 border-white/10"
									/>
								</div>

								{/* Description */}
								<div>
									<label className="text-sm text-[#A1A1AA] block mb-2">
										Description
									</label>
									<textarea
										value={description}
										onChange={(e) => setDescription(e.target.value)}
										placeholder="Enter description..."
										data-testid="upload-description"
										className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white min-h-[100px] resize-none"
									/>
								</div>

								{/* Type & Genre */}
								<div className="grid grid-cols-2 gap-4">
									<div>
										<label className="text-sm text-[#A1A1AA] block mb-2">
											Type
										</label>
										<div className="flex gap-2">
											<button
												onClick={() => setMediaType("movie")}
												className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg transition-all ${
													mediaType === "movie"
														? "bg-[#7C3AED] text-white"
														: "bg-white/5 text-[#A1A1AA] hover:bg-white/10"
												}`}>
												<Film className="w-4 h-4" />
												Movie
											</button>
											<button
												onClick={() => setMediaType("tv")}
												className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg transition-all ${
													mediaType === "tv"
														? "bg-[#7C3AED] text-white"
														: "bg-white/5 text-[#A1A1AA] hover:bg-white/10"
												}`}>
												<Tv className="w-4 h-4" />
												TV Show
											</button>
										</div>
									</div>
									<div>
										<label className="text-sm text-[#A1A1AA] block mb-2">
											Year
										</label>
										<Input
											type="number"
											value={year}
											onChange={(e) => setYear(e.target.value)}
											placeholder="2024"
											className="bg-black/50 border-white/10"
										/>
									</div>
								</div>

								{/* Genre */}
								<div>
									<label className="text-sm text-[#A1A1AA] block mb-2">
										Genre
									</label>
									<Input
										value={genre}
										onChange={(e) => setGenre(e.target.value)}
										placeholder="Action, Drama, Comedy..."
										className="bg-black/50 border-white/10"
									/>
								</div>

								{/* Video Upload */}
								<div>
									<label className="text-sm text-[#A1A1AA] block mb-2">
										Video File * (MP4, WebM, MOV - Max 500MB)
									</label>
									<input
										ref={videoInputRef}
										type="file"
										accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
										onChange={handleVideoSelect}
										className="hidden"
									/>
									{videoPreview ? (
										<div className="relative rounded-xl overflow-hidden bg-black">
											<video
												src={videoPreview}
												className="w-full h-48 object-contain"
												controls
											/>
											<button
												onClick={() => {
													setVideoFile(null);
													setVideoPreview(null);
												}}
												className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
												<X className="w-4 h-4" />
											</button>
										</div>
									) : (
										<button
											onClick={() => videoInputRef.current?.click()}
											data-testid="select-video-btn"
											className="w-full border-2 border-dashed border-white/10 rounded-xl p-8 hover:border-[#7C3AED]/50 transition-colors">
											<Upload className="w-10 h-10 text-[#52525B] mx-auto mb-3" />
											<p className="text-[#A1A1AA]">
												Click to select video file
											</p>
										</button>
									)}
								</div>

								{/* Poster Upload */}
								<div>
									<label className="text-sm text-[#A1A1AA] block mb-2">
										Poster Image (Optional)
									</label>
									<input
										ref={posterInputRef}
										type="file"
										accept="image/*"
										onChange={handlePosterSelect}
										className="hidden"
									/>
									{posterPreview ? (
										<div className="relative w-32 h-48 rounded-xl overflow-hidden">
											<img
												src={posterPreview}
												alt="Poster preview"
												className="w-full h-full object-cover"
											/>
											<button
												onClick={() => {
													setPosterFile(null);
													setPosterPreview(null);
												}}
												className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
												<X className="w-3 h-3" />
											</button>
										</div>
									) : (
										<button
											onClick={() => posterInputRef.current?.click()}
											data-testid="select-poster-btn"
											className="w-32 h-48 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center hover:border-[#7C3AED]/50 transition-colors">
											<Image className="w-8 h-8 text-[#52525B] mb-2" />
											<p className="text-xs text-[#A1A1AA]">Add Poster</p>
										</button>
									)}
								</div>

								{/* Progress Bar */}
								{uploading && (
									<div className="space-y-2">
										<div className="h-2 bg-white/10 rounded-full overflow-hidden">
											<div
												className="h-full bg-[#7C3AED] transition-all duration-300"
												style={{ width: `${uploadProgress}%` }}
											/>
										</div>
										<p className="text-sm text-[#A1A1AA] text-center">
											Uploading... {uploadProgress}%
										</p>
									</div>
								)}

								{/* Upload Button */}
								<Button
									onClick={handleUpload}
									disabled={uploading || !title || !videoFile}
									data-testid="confirm-upload-btn"
									className="w-full btn-primary">
									{uploading ? "Uploading..." : "Upload Content"}
								</Button>
							</div>
						</DialogContent>
					</Dialog>
				</div>

				{/* Content Grid */}
				{loading ? (
					<div className="flex justify-center py-20">
						<div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
					</div>
				) : content.length > 0 ? (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
						{content.map((item) => (
							<div
								key={item.content_id}
								className="glass rounded-xl overflow-hidden group">
								{/* Thumbnail */}
								<div className="relative aspect-video bg-[#121212]">
									{item.poster_url ? (
										<img
											src={BACKEND_URL + item.poster_url}
											alt={item.title}
											className="w-full h-full object-cover"
										/>
									) : (
										<div className="w-full h-full flex items-center justify-center">
											<Film className="w-12 h-12 text-[#52525B]" />
										</div>
									)}

									{/* Play overlay */}
									<div
										onClick={() => watchContent(item)}
										className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
										<div className="w-14 h-14 rounded-full bg-[#7C3AED] flex items-center justify-center">
											<Play className="w-7 h-7 fill-current ml-1" />
										</div>
									</div>

									{/* Type badge */}
									<div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/70 backdrop-blur-sm text-xs flex items-center gap-1">
										{item.media_type === "tv" ? (
											<Tv className="w-3 h-3" />
										) : (
											<Film className="w-3 h-3" />
										)}
										{item.media_type === "tv" ? "TV Show" : "Movie"}
									</div>
								</div>

								{/* Info */}
								<div className="p-4">
									<h3 className="font-semibold line-clamp-1 mb-1">
										{item.title}
									</h3>
									{item.description && (
										<p className="text-sm text-[#A1A1AA] line-clamp-2 mb-3">
											{item.description}
										</p>
									)}
									<div className="flex items-center justify-between text-xs text-[#52525B]">
										<div className="flex items-center gap-3">
											{item.year && <span>{item.year}</span>}
											<span className="flex items-center gap-1">
												<Eye className="w-3 h-3" />
												{item.views || 0}
											</span>
										</div>
										{item.uploaded_by === user?.user_id && (
											<button
												onClick={() => deleteContent(item.content_id)}
												data-testid={`delete-${item.content_id}`}
												className="text-red-500 hover:text-red-400 transition-colors">
												<Trash2 className="w-4 h-4" />
											</button>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="text-center py-20">
						<Upload className="w-16 h-16 text-[#52525B] mx-auto mb-4" />
						<h3 className="text-xl font-semibold mb-2">No uploads yet</h3>
						<p className="text-[#A1A1AA] mb-6">
							Upload your first movie or TV show
						</p>
						<Button
							onClick={() => setUploadDialogOpen(true)}
							className="btn-primary">
							<Plus className="w-5 h-5 mr-2" />
							Upload Content
						</Button>
					</div>
				)}
			</div>
		</div>
	);
};

export default CustomContentPage;
