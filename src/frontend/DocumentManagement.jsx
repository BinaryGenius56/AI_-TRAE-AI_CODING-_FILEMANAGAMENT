import React, { useState, useEffect, useRef } from 'react';
import {
  Container,
  Typography,
  Paper,
  Grid,
  Button,
  TextField,
  IconButton,
  Box,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
  Alert,
  Card,
  CardContent,
  CardActions,
  Tooltip,
  LinearProgress,
  Tab,
  Tabs,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Search as SearchIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Description as FileIcon,
  Image as ImageIcon,
  PictureAsPdf as PdfIcon,
  InsertDriveFile as GenericFileIcon,
  CheckCircle as ValidIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  FilterList as FilterIcon,
  Tag as TagIcon,
  History as HistoryIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { format } from 'date-fns';

// Mock API service - would be replaced with actual API calls
const documentService = {
  getPatientDocuments: async (patientId, filters = {}) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Mock data
    const documents = [
      {
        id: '1',
        patientId,
        title: 'MRI Report',
        type: 'report',
        fileType: 'pdf',
        uploadDate: new Date(2023, 2, 15),
        uploadedBy: 'Dr. Smith',
        tags: ['radiology', 'brain', 'mri'],
        status: 'validated',
        aiProcessed: true,
        aiFindings: {
          patientNameMatch: true,
          patientDobMatch: true,
          scanDateDetected: '2023-03-10',
          physicianDetected: 'Dr. Johnson',
          keyFindings: ['No abnormalities detected', 'Normal brain structure']
        },
        versions: [
          { id: '1-1', version: 1, uploadDate: new Date(2023, 2, 15) }
        ],
        url: 'https://example.com/documents/mri-report.pdf'
      },
      {
        id: '2',
        patientId,
        title: 'Chest X-Ray',
        type: 'image',
        fileType: 'dicom',
        uploadDate: new Date(2023, 1, 20),
        uploadedBy: 'Dr. Johnson',
        tags: ['radiology', 'chest', 'x-ray'],
        status: 'validated',
        aiProcessed: true,
        aiFindings: {
          patientNameMatch: true,
          patientDobMatch: true,
          scanDateDetected: '2023-02-18',
          physicianDetected: 'Dr. Williams',
          keyFindings: ['Clear lung fields', 'No cardiomegaly']
        },
        versions: [
          { id: '2-1', version: 1, uploadDate: new Date(2023, 1, 20) }
        ],
        url: 'https://example.com/documents/chest-xray.dcm'
      },
      {
        id: '3',
        patientId,
        title: 'Blood Test Results',
        type: 'lab',
        fileType: 'pdf',
        uploadDate: new Date(2023, 3, 5),
        uploadedBy: 'Nurse Adams',
        tags: ['laboratory', 'blood', 'routine'],
        status: 'warning',
        aiProcessed: true,
        aiFindings: {
          patientNameMatch: true,
          patientDobMatch: false, // Mismatch detected
          scanDateDetected: '2023-04-03',
          physicianDetected: 'Dr. Brown',
          keyFindings: ['Elevated white blood cell count', 'Normal hemoglobin']
        },
        versions: [
          { id: '3-1', version: 1, uploadDate: new Date(2023, 3, 5) }
        ],
        url: 'https://example.com/documents/blood-test.pdf'
      },
      {
        id: '4',
        patientId,
        title: 'Prescription',
        type: 'medication',
        fileType: 'pdf',
        uploadDate: new Date(2023, 3, 10),
        uploadedBy: 'Dr. Smith',
        tags: ['medication', 'prescription'],
        status: 'error',
        aiProcessed: true,
        aiFindings: {
          patientNameMatch: false, // Critical mismatch
          patientDobMatch: true,
          scanDateDetected: '2023-04-10',
          physicianDetected: 'Dr. Smith',
          keyFindings: ['Prescription for Lisinopril 10mg']
        },
        versions: [
          { id: '4-1', version: 1, uploadDate: new Date(2023, 3, 10) }
        ],
        url: 'https://example.com/documents/prescription.pdf'
      },
    ];
    
    // Apply filters
    let filteredDocs = [...documents];
    
    if (filters.type && filters.type !== 'all') {
      filteredDocs = filteredDocs.filter(doc => doc.type === filters.type);
    }
    
    if (filters.status && filters.status !== 'all') {
      filteredDocs = filteredDocs.filter(doc => doc.status === filters.status);
    }
    
    if (filters.dateFrom) {
      filteredDocs = filteredDocs.filter(doc => doc.uploadDate >= filters.dateFrom);
    }
    
    if (filters.dateTo) {
      filteredDocs = filteredDocs.filter(doc => doc.uploadDate <= filters.dateTo);
    }
    
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filteredDocs = filteredDocs.filter(doc => 
        doc.title.toLowerCase().includes(term) || 
        doc.tags.some(tag => tag.toLowerCase().includes(term))
      );
    }
    
    return filteredDocs;
  },
  
  uploadDocument: async (patientId, documentData, file) => {
    // Simulate API call with delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Simulate document processing
    const newDoc = {
      id: Math.random().toString(36).substr(2, 9),
      patientId,
      title: documentData.title,
      type: documentData.type,
      fileType: file.name.split('.').pop().toLowerCase(),
      uploadDate: new Date(),
      uploadedBy: documentData.uploadedBy || 'Current User',
      tags: documentData.tags || [],
      status: 'processing',
      aiProcessed: false,
      versions: [
        { id: Math.random().toString(36).substr(2, 9), version: 1, uploadDate: new Date() }
      ],
      url: URL.createObjectURL(file) // In a real app, this would be a server URL
    };
    
    // Simulate AI processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Update with AI results
    newDoc.aiProcessed = true;
    newDoc.status = Math.random() > 0.7 ? 'validated' : (Math.random() > 0.5 ? 'warning' : 'error');
    newDoc.aiFindings = {
      patientNameMatch: Math.random() > 0.2,
      patientDobMatch: Math.random() > 0.2,
      scanDateDetected: format(new Date(), 'yyyy-MM-dd'),
      physicianDetected: documentData.uploadedBy || 'Unknown',
      keyFindings: ['AI-detected finding 1', 'AI-detected finding 2']
    };
    
    return newDoc;
  },
  
  updateDocument: async (documentId, updates) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    
    return {
      ...updates,
      id: documentId,
      updatedAt: new Date()
    };
  },
  
  deleteDocument: async (documentId) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 600));
    return { success: true };
  },
  
  getDocumentVersions: async (documentId) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 400));
    
    // Mock versions
    return [
      { id: `${documentId}-1`, version: 1, uploadDate: new Date(2023, 2, 15), uploadedBy: 'Dr. Smith' },
      { id: `${documentId}-2`, version: 2, uploadDate: new Date(2023, 2, 18), uploadedBy: 'Dr. Johnson' },
      { id: `${documentId}-3`, version: 3, uploadDate: new Date(2023, 2, 20), uploadedBy: 'Nurse Adams' },
    ];
  }
};

const DocumentManagement = ({ patientId, patientName }) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openUploadDialog, setOpenUploadDialog] = useState(false);
  const [openViewDialog, setOpenViewDialog] = useState(false);
  const [openVersionsDialog, setOpenVersionsDialog] = useState(false);
  const [currentDocument, setCurrentDocument] = useState(null);
  const [documentVersions, setDocumentVersions] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    type: 'all',
    status: 'all',
    dateFrom: null,
    dateTo: null,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  
  // Form state for document upload
  const [formData, setFormData] = useState({
    title: '',
    type: 'report',
    tags: [],
    uploadedBy: 'Current User',
  });
  
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  
  useEffect(() => {
    loadDocuments();
  }, [patientId, filters, searchTerm]);
  
  const loadDocuments = async () => {
    try {
      setLoading(true);
      const data = await documentService.getPatientDocuments(patientId, {
        ...filters,
        searchTerm
      });
      setDocuments(data);
      setError(null);
    } catch (err) {
      setError('Failed to load documents');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleOpenUploadDialog = () => {
    setFormData({
      title: '',
      type: 'report',
      tags: [],
      uploadedBy: 'Current User',
    });
    setSelectedFile(null);
    setOpenUploadDialog(true);
  };
  
  const handleCloseUploadDialog = () => {
    setOpenUploadDialog(false);
    setUploadProgress(0);
    setIsUploading(false);
  };
  
  const handleOpenViewDialog = (document) => {
    setCurrentDocument(document);
    setOpenViewDialog(true);
  };
  
  const handleCloseViewDialog = () => {
    setOpenViewDialog(false);
    setCurrentDocument(null);
  };
  
  const handleOpenVersionsDialog = async (document) => {
    setCurrentDocument(document);
    try {
      const versions = await documentService.getDocumentVersions(document.id);
      setDocumentVersions(versions);
      setOpenVersionsDialog(true);
    } catch (err) {
      console.error('Error fetching document versions:', err);
      setSnackbarMessage('Failed to fetch document versions');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
    }
  };
  
  const handleCloseVersionsDialog = () => {
    setOpenVersionsDialog(false);
    setCurrentDocument(null);
    setDocumentVersions([]);
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };
  
  const handleTagInput = (e) => {
    if (e.key === 'Enter' && e.target.value.trim() !== '') {
      const newTag = e.target.value.trim().toLowerCase();
      if (!formData.tags.includes(newTag)) {
        setFormData({
          ...formData,
          tags: [...formData.tags, newTag],
        });
      }
      e.target.value = '';
    }
  };
  
  const handleRemoveTag = (tagToRemove) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(tag => tag !== tagToRemove),
    });
  };
  
  const handleFileSelect = (e) => {
    if (e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      
      // Auto-fill title if empty
      if (!formData.title) {
        const fileName = e.target.files[0].name;
        const titleWithoutExtension = fileName.substring(0, fileName.lastIndexOf('.'));
        setFormData({
          ...formData,
          title: titleWithoutExtension,
        });
      }
    }
  };
  
  const handleUpload = async () => {
    if (!selectedFile) {
      setSnackbarMessage('Please select a file to upload');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
      return;
    }
    
    if (!formData.title) {
      setSnackbarMessage('Please enter a title for the document');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
      return;
    }
    
    try {
      setIsUploading(true);
      
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 300);
      
      const newDocument = await documentService.uploadDocument(patientId, formData, selectedFile);
      
      // Complete progress
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      // Add new document to list
      setDocuments(prev => [newDocument, ...prev]);
      
      setSnackbarMessage('Document uploaded successfully');
      setSnackbarSeverity('success');
      setShowSnackbar(true);
      
      // Close dialog after a short delay to show 100% progress
      setTimeout(() => {
        handleCloseUploadDialog();
      }, 500);
      
    } catch (err) {
      console.error('Error uploading document:', err);
      setSnackbarMessage('Failed to upload document');
      setSnackbarSeverity('error');
      setShowSnackbar(true);
      setIsUploading(false);
    }
  };
  
  const handleDeleteDocument = async (documentId) => {
    if (window.confirm('Are you sure you want to delete this document?')) {
      try {
        await documentService.deleteDocument(documentId);
        setDocuments(documents.filter(doc => doc.id !== documentId));
        setSnackbarMessage('Document deleted successfully');
        setSnackbarSeverity('success');
        setShowSnackbar(true);
      } catch (err) {
        console.error('Error deleting document:', err);
        setSnackbarMessage('Failed to delete document');
        setSnackbarSeverity('error');
        setShowSnackbar(true);
      }
    }
  };
  
  const handleCloseSnackbar = () => {
    setShowSnackbar(false);
  };
  
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };
  
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters({
      ...filters,
      [name]: value,
    });
  };
  
  const handleDateChange = (name, date) => {
    setFilters({
      ...filters,
      [name]: date,
    });
  };
  
  const handleResetFilters = () => {
    setFilters({
      type: 'all',
      status: 'all',
      dateFrom: null,
      dateTo: null,
    });
    setSearchTerm('');
  };
  
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };
  
  const getFileIcon = (fileType) => {
    switch (fileType) {
      case 'pdf':
        return <PdfIcon />;
      case 'jpg':
      case 'jpeg':
      case 'png':
        return <ImageIcon />;
      case 'dicom':
        return <ImageIcon />;
      default:
        return <GenericFileIcon />;
    }
  };
  
  const getStatusIcon = (status) => {
    switch (status) {
      case 'validated':
        return <ValidIcon color="success" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      case 'error':
        return <ErrorIcon color="error" />;
      case 'processing':
        return <CircularProgress size={20} />;
      default:
        return <GenericFileIcon />;
    }
  };
  
  const getStatusText = (status) => {
    switch (status) {
      case 'validated':
        return 'Validated';
      case 'warning':
        return 'Warning';
      case 'error':
        return 'Error';
      case 'processing':
        return 'Processing';
      default:
        return 'Unknown';
    }
  };
  
  const renderDocumentList = () => {
    if (loading) {
      return <CircularProgress />;
    }
    
    if (error) {
      return <Alert severity="error">{error}</Alert>;
    }
    
    if (documents.length === 0) {
      return (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1">No documents found</Typography>
        </Paper>
      );
    }
    
    return (
      <Grid container spacing={2}>
        {documents.map((document) => (
          <Grid item xs={12} sm={6} md={4} key={document.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  {getFileIcon(document.fileType)}
                  <Typography variant="h6" sx={{ ml: 1 }}>
                    {document.title}
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Tooltip title={getStatusText(document.status)}>
                    <Box sx={{ mr: 1 }}>
                      {getStatusIcon(document.status)}
                    </Box>
                  </Tooltip>
                  <Typography variant="body2" color="textSecondary">
                    {format(new Date(document.uploadDate), 'MMM dd, yyyy')}
                  </Typography>
                </Box>
                
                <Typography variant="body2" color="textSecondary">
                  Type: {document.type.charAt(0).toUpperCase() + document.type.slice(1)}
                </Typography>
                
                <Typography variant="body2" color="textSecondary">
                  Uploaded by: {document.uploadedBy}
                </Typography>
                
                <Box sx={{ mt: 1 }}>
                  {document.tags.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      sx={{ mr: 0.5, mb: 0.5 }}
                    />
                  ))}
                </Box>
              </CardContent>
              <CardActions>
                <Button
                  size="small"
                  startIcon={<ViewIcon />}
                  onClick={() => handleOpenViewDialog(document)}
                >
                  View
                </Button>
                <Button
                  size="small"
                  startIcon={<HistoryIcon />}
                  onClick={() => handleOpenVersionsDialog(document)}
                >
                  Versions
                </Button>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleDeleteDocument(document.id)}
                >
                  <DeleteIcon />
                </IconButton>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    );
  };
  
  const renderAIFindings = (document) => {
    if (!document || !document.aiProcessed) {
      return (
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <CircularProgress size={20} sx={{ mr: 1 }} />
          <Typography>Processing document...</Typography>
        </Box>
      );
    }
    
    const { aiFindings } = document;
    
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>AI Validation Results</Typography>
        
        <List>
          <ListItem>
            <ListItemIcon>
              {aiFindings.patientNameMatch ? 
                <ValidIcon color="success" /> : 
                <ErrorIcon color="error" />}
            </ListItemIcon>
            <ListItemText 
              primary="Patient Name"
              secondary={aiFindings.patientNameMatch ? 
                "Matches patient record" : 
                "MISMATCH - Document may belong to another patient"}
            />
          </ListItem>
          
          <ListItem>
            <ListItemIcon>
              {aiFindings.patientDobMatch ? 
                <ValidIcon color="success" /> : 
                <WarningIcon color="warning" />}
            </ListItemIcon>
            <ListItemText 
              primary="Date of Birth"
              secondary={aiFindings.patientDobMatch ? 
                "Matches patient record" : 
                "MISMATCH - Please verify patient identity"}
            />
          </ListItem>
          
          <ListItem>
            <ListItemIcon>
              <ValidIcon color="success" />
            </ListItemIcon>
            <ListItemText 
              primary="Scan Date"
              secondary={`Detected: ${aiFindings.scanDateDetected}`}
            />
          </ListItem>
          
          <ListItem>
            <ListItemIcon>
              <ValidIcon color="success" />
            </ListItemIcon>
            <ListItemText 
              primary="Physician"
              secondary={`Detected: ${aiFindings.physicianDetected}`}
            />
          </ListItem>
          
          <Divider sx={{ my: 2 }} />
          
          <ListItem>
            <ListItemText 
              primary="Key Findings"
              secondary={
                <List dense>
                  {aiFindings.keyFindings.map((finding, index) => (
                    <ListItem key={index}>
                      <ListItemIcon sx={{ minWidth: 30 }}>
                        <ValidIcon color="success" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={finding} />
                    </ListItem>
                  ))}
                </List>
              }
            />
          </ListItem>
        </List>
      </Box>
    );
  };
  
  return (
    <Container maxWidth="lg">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Document Management
        </Typography>
        <Typography variant="h6" color="textSecondary">
          Patient: {patientName}
        </Typography>
      </Box>
      
      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="Search Documents"
              variant="outlined"
              value={searchTerm}
              onChange={handleSearchChange}
              InputProps={{
                startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
              }}
            />
          </Grid>
          
          <Grid item xs={12} sm={6} md={8}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                startIcon={<FilterIcon />}
                onClick={() => setShowFilters(!showFilters)}
                sx={{ mr: 1 }}
              >
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </Button>
              
              <Button
                variant="contained"
                color="primary"
                startIcon={<UploadIcon />}
                onClick={handleOpenUploadDialog}
              >
                Upload Document
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Box>
      
      {showFilters && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Filters</Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth>
                <InputLabel>Document Type</InputLabel>
                <Select
                  name="type"
                  value={filters.type}
                  onChange={handleFilterChange}
                  label="Document Type"
                >
                  <MenuItem value="all">All Types</MenuItem>
                  <MenuItem value="report">Reports</MenuItem>
                  <MenuItem value="image">Images</MenuItem>
                  <MenuItem value="lab">Lab Results</MenuItem>
                  <MenuItem value="medication">Medication</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  name="status"
                  value={filters.status}
                  onChange={handleFilterChange}
                  label="Status"
                >
                  <MenuItem value="all">All Statuses</MenuItem>
                  <MenuItem value="validated">Validated</MenuItem>
                  <MenuItem value="warning">Warning</MenuItem>
                  <MenuItem value="error">Error</MenuItem>
                  <MenuItem value="processing">Processing</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="From Date"
                  value={filters.dateFrom}
                  onChange={(date) => handleDateChange('dateFrom', date)}
                  renderInput={(params) => <TextField {...params} fullWidth />}
                />
              </LocalizationProvider>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="To Date"
                  value={filters.dateTo}
                  onChange={(date) => handleDateChange('dateTo', date)}
                  renderInput={(params) => <TextField {...params} fullWidth />}
                />
              </LocalizationProvider>
            </Grid>
            
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button onClick={handleResetFilters}>Reset Filters</Button>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      )}
      
      {renderDocumentList()}
      
      {/* Upload Document Dialog */}
      <Dialog open={openUploadDialog} onClose={handleCloseUploadDialog} maxWidth="md" fullWidth>
        <DialogTitle>Upload New Document</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2, mt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Box 
                  sx={{
                    border: '2px dashed #ccc',
                    borderRadius: 2,
                    p: 3,
                    textAlign: 'center',
                    mb: 2,
                    cursor: 'pointer',
                    '&:hover': { borderColor: 'primary.main' },
                  }}
                  onClick={() => fileInputRef.current.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                    accept=".pdf,.jpg,.jpeg,.png,.dicom,.dcm"
                  />
                  <UploadIcon fontSize="large" color="primary" />
                  <Typography variant="h6" sx={{ mt: 1 }}>
                    {selectedFile ? selectedFile.name : 'Click to select a file or drag and drop'}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Supported formats: PDF, JPEG, PNG, DICOM
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Document Title"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  fullWidth
                  required
                  margin="normal"
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth margin="normal">
                  <InputLabel>Document Type</InputLabel>
                  <Select
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                    label="Document Type"
                  >
                    <MenuItem value="report">Report</MenuItem>
                    <MenuItem value="image">Image</MenuItem>
                    <MenuItem value="lab">Lab Result</MenuItem>
                    <MenuItem value="medication">Medication</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  label="Uploaded By"
                  name="uploadedBy"
                  value={formData.uploadedBy}
                  onChange={handleInputChange}
                  fullWidth
                  margin="normal"
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  label="Add Tags (Press Enter to add)"
                  fullWidth
                  margin="normal"
                  onKeyDown={handleTagInput}
                />
                <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap' }}>
                  {formData.tags.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      onDelete={() => handleRemoveTag(tag)}
                      sx={{ mr: 0.5, mb: 0.5 }}
                    />
                  ))}
                </Box>
              </Grid>
              
              {isUploading && (
                <Grid item xs={12}>
                  <Box sx={{ width: '100%', mt: 2 }}>
                    <LinearProgress variant="determinate" value={uploadProgress} />
                    <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
                      {uploadProgress < 100 ? 'Uploading...' : 'Processing document...'}
                      {uploadProgress}%
                    </Typography>
                  </Box>
                </Grid>
              )}
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseUploadDialog} disabled={isUploading}>Cancel</Button>
          <Button 
            onClick={handleUpload} 
            variant="contained" 
            color="primary"
            disabled={isUploading || !selectedFile}
          >
            {isUploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* View Document Dialog */}
      <Dialog open={openViewDialog} onClose={handleCloseViewDialog} maxWidth="lg" fullWidth>
        {currentDocument && (
          <>
            <DialogTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6">{currentDocument.title}</Typography>
                <Chip 
                  label={getStatusText(currentDocument.status)}
                  color={currentDocument.status === 'validated' ? 'success' : 
                         currentDocument.status === 'warning' ? 'warning' : 
                         currentDocument.status === 'error' ? 'error' : 'default'}
                  icon={getStatusIcon(currentDocument.status)}
                />
              </Box>
            </DialogTitle>
            <DialogContent>
              <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tab label="Document" />
                <Tab label="AI Validation" />
                <Tab label="Details" />
              </Tabs>
              
              {tabValue === 0 && (
                <Box sx={{ height: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  {currentDocument.fileType === 'pdf' ? (
                    <iframe 
                      src={currentDocument.url} 
                      width="100%" 
                      height="100%" 
                      style={{ border: 'none' }} 
                      title={currentDocument.title}
                    />
                  ) : currentDocument.fileType === 'dicom' ? (
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body1" gutterBottom>DICOM Viewer</Typography>
                      <img 
                        src="https://via.placeholder.com/800x600?text=DICOM+Viewer+Placeholder" 
                        alt="DICOM Viewer Placeholder" 
                        style={{ maxWidth: '100%', maxHeight: '60vh' }}
                      />
                    </Box>
                  ) : (
                    <img 
                      src={currentDocument.url} 
                      alt={currentDocument.title} 
                      style={{ maxWidth: '100%', maxHeight: '60vh' }}
                    />
                  )}
                </Box>
              )}
              
              {tabValue === 1 && renderAIFindings(currentDocument)}
              
              {tabValue === 2 && (
                <Box sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>Document Details</Typography>
                  
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2">Document Type</Typography>
                      <Typography variant="body1" gutterBottom>
                        {currentDocument.type.charAt(0).toUpperCase() + currentDocument.type.slice(1)}
                      </Typography>
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2">File Format</Typography>
                      <Typography variant="body1" gutterBottom>
                        {currentDocument.fileType.toUpperCase()}
                      </Typography>
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2">Upload Date</Typography>
                      <Typography variant="body1" gutterBottom>
                        {format(new Date(currentDocument.uploadDate), 'MMMM dd, yyyy HH:mm')}
                      </Typography>
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2">Uploaded By</Typography>
                      <Typography variant="body1" gutterBottom>
                        {currentDocument.uploadedBy}
                      </Typography>
                    </Grid>
                    
                    <Grid item xs={12}>
                      <Typography variant="subtitle2">Tags</Typography>
                      <Box sx={{ mt: 1 }}>
                        {currentDocument.tags.length > 0 ? (
                          currentDocument.tags.map((tag) => (
                            <Chip
                              key={tag}
                              label={tag}
                              size="small"
                              sx={{ mr: 0.5, mb: 0.5 }}
                            />
                          ))
                        ) : (
                          <Typography variant="body2" color="textSecondary">No tags</Typography>
                        )}
                      </Box>
                    </Grid>
                  </Grid>
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button 
                startIcon={<DownloadIcon />}
                onClick={() => window.open(currentDocument.url, '_blank')}
              >
                Download
              </Button>
              <Button onClick={handleCloseViewDialog}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
      
      {/* Document Versions Dialog */}
      <Dialog open={openVersionsDialog} onClose={handleCloseVersionsDialog} maxWidth="md">
        {currentDocument && (
          <>
            <DialogTitle>Document Versions - {currentDocument.title}</DialogTitle>
            <DialogContent>
              <List>
                {documentVersions.map((version) => (
                  <ListItem key={version.id}>
                    <ListItemIcon>
                      {getFileIcon(currentDocument.fileType)}
                    </ListItemIcon>
                    <ListItemText
                      primary={`Version ${version.version}`}
                      secondary={`Uploaded on ${format(new Date(version.uploadDate), 'MMMM dd, yyyy')} by ${version.uploadedBy}`}
                    />
                    <ListItemSecondaryAction>
                      <IconButton edge="end" onClick={() => window.open(currentDocument.url, '_blank')}>
                        <DownloadIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseVersionsDialog}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
      
      {/* Snackbar for notifications */}
      <Snackbar
        open={showSnackbar}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbarSeverity}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default DocumentManagement;