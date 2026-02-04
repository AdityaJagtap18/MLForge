#!/usr/bin/python
import os
import pandas as pd

from sklearn.metrics import explained_variance_score
from sklearn.metrics import max_error
from sklearn.metrics import mean_absolute_error
from sklearn.metrics import mean_squared_error
from sklearn.metrics import mean_squared_log_error
from sklearn.metrics import median_absolute_error
from sklearn.metrics import r2_score
from sklearn.metrics import mean_poisson_deviance
from sklearn.metrics import mean_gamma_deviance
from sklearn.metrics import mean_tweedie_deviance
from sklearn.metrics import classification_report
from sklearn.metrics import accuracy_score
from sklearn.base import is_classifier, is_regressor
import logging

from config import Config

class Metrics:


	def __init__(self, header_id, training_id, y_true, y_test,
             model_object, model_name, filename, timestamp, fileCode):

		self.y_true = y_true.flatten()
		self.y_test = y_test.flatten()
		self.model_object = model_object
		self.model_name = model_name
		self.file_name = filename
		self.timestamp = timestamp
		self.fileCode = fileCode

		if is_classifier(self.model_object):
			self.classification_metrics()
		else:
			self.regression_metrics()


	#Compute the regression metrics
	def regression_metrics(self):
		try:
			exp_var_score = explained_variance_score(self.y_true,self.y_test)
			max_err = max_error(self.y_true,self.y_test)
			mean_abs_error = mean_absolute_error(self.y_true,self.y_test)
			mean_sq_error = mean_squared_error(self.y_true,self.y_test)
			median_abs_error = median_absolute_error(self.y_true,self.y_test)
			r2score = r2_score(self.y_true,self.y_test)
			try:
				mean_sq_log_error = mean_squared_log_error(self.y_true,self.y_test)
			except ValueError as ve:
				mean_sq_log_error = ve
				print(ve)
			try:
				mean_poisson_dev = mean_poisson_deviance(self.y_true,self.y_test)
			except ValueError as ve:
				mean_poisson_dev = ve
				print(ve)
			try:
				mean_gamma_dev = mean_gamma_deviance(self.y_true,self.y_test)
			except ValueError as ve:
				mean_gamma_dev = ve
				print(ve)
			try:
				mean_tweedie_dev = mean_tweedie_deviance(self.y_true,self.y_test)
			except ValueError as ve:
				mean_tweedie_dev = ve
				print(ve)
			df = pd.DataFrame({'_Time_':self.timestamp,'_Experiment_':self.file_name,'_Model_Name_':self.model_name,'_Explained_Variance_Score_':exp_var_score,'_Max_Error_':max_err,'_Mean_Absolute_Error_':mean_abs_error,'_Mean_Squared_Error_':mean_sq_error,
			'_Mean_Squared_Log_Error_':mean_sq_log_error,'_Median_Absolute_Error_':median_abs_error,'_R2_score_':r2score,'_Mean_poisson_deviance_':mean_poisson_dev,'_Mean_Gamma_Deviance_':    mean_gamma_dev,
			'_Mean_Tweedie_deviance_':mean_tweedie_dev},index = [0])
			if self.fileCode == 'TRAIN':
				self.file_name = os.path.join(Config.TRAINING_OUTPUT_FOLDER,self.file_name+'_metric.csv')
			elif self.fileCode == 'TEXT_CLASSIFIER_TRAIN':
				self.file_name = os.path.join(Config.TEXT_CLASSIFIER_TRAIN_OUTPUT_FOLDER,self.file_name+'_metric.csv')
			df.to_csv(self.file_name,index = False)
			print("Succesful metric file generation")
		except FileNotFoundError as fne:
			print(fne)

	def classification_metrics(self):
		try:
			classifier_accuracy_score = accuracy_score(self.y_true,self.y_test) 
			classifier_report = classification_report(self.y_true,self.y_test,output_dict=True)
			df = pd.DataFrame(classifier_report).transpose()
			df.rename(columns={'f1-score': '_f1_score_'},inplace = True)
			df.rename(columns={'support': '_support_'},inplace = True)
			df.rename(columns={'precision': '_precision_'},inplace = True)
			df.insert(loc=0, column='_Model_Name_',value = '')
			df['_accuracy_score_'] = ''
			df['_accuracy_score_'].iloc[0] = classifier_accuracy_score
			df['_Model_Name_'] = self.model_name
			df.index.name='_weighted_average_'
			if self.fileCode == 'TRAIN':
				self.file_name = os.path.join(Config.TRAINING_OUTPUT_FOLDER,self.file_name+'_metric.csv')
			elif self.fileCode == 'TEXT_CLASSIFIER_TRAIN':
				self.file_name = os.path.join(Config.TEXT_CLASSIFIER_TRAIN_OUTPUT_FOLDER,self.file_name+'_metric.csv')
			df.index.name = 'Weighted_Average'
			df.to_csv(self.file_name)
			print("Succesful metric file generation")
		except FileNotFoundError as fne:
			print(fne)